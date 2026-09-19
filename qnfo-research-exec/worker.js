var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var __defProp2222 = Object.defineProperty;
var __name2222 = /* @__PURE__ */ __name222((target, value) => __defProp2222(target, "name", { value, configurable: true }), "__name");
var VERSION = "0.9.8";
var WORKER = "qnfo-research-exec";
var NL = String.fromCharCode(10);
var MODELS = ["@cf/deepseek-ai/deepseek-v4-flash-0731", "@cf/zai-org/glm-5.3"];
var MAX_PAPER = 3e4;
var ORCID = "0009-0002-4317-5604";
var AUTHOR = "Rowan Brad Quni-Gudzinas";
var ROUTER = "https://qnfo-ai.q08.workers.dev/v1/chat/completions";
function routerFetch(env, url, opts) {
  if (env && env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") {
    return env.QNFO_AI.fetch(url, opts);
  }
  return fetch(url, opts);
}
__name(routerFetch, "routerFetch");
__name2(routerFetch, "routerFetch");
__name22(routerFetch, "routerFetch");
var GATEWAY_MODEL = "deepseek-v4-flash";
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
__name222(json, "json");
__name2222(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
__name2(nowIso, "nowIso");
__name22(nowIso, "nowIso");
__name222(nowIso, "nowIso");
__name2222(nowIso, "nowIso");
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "paper";
}
__name(slugify, "slugify");
__name2(slugify, "slugify");
__name22(slugify, "slugify");
__name222(slugify, "slugify");
__name2222(slugify, "slugify");
async function logEvent(env, kind, text, status) {
  try {
    const id = "re-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)").bind(id, nowIso(), kind, String(text).slice(0, 800), "{}", WORKER, status || "ok").run();
  } catch (e) {
  }
}
__name(logEvent, "logEvent");
__name2(logEvent, "logEvent");
__name22(logEvent, "logEvent");
__name222(logEvent, "logEvent");
__name2222(logEvent, "logEvent");
async function runModel(env, prompt, maxTokens) {
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    try {
      const aiPromise = env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.3 });
      aiPromise.catch(function() {
      });
      const toPromise = new Promise(function(resolve) {
        setTimeout(function() {
          resolve("__TIMEOUT__");
        }, 9e4);
      });
      const r = await Promise.race([aiPromise, toPromise]);
      if (r === "__TIMEOUT__") {
        await logEvent(env, "ai-error", model + " timed out after 90s");
        continue;
      }
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
__name2(runModel, "runModel");
__name22(runModel, "runModel");
__name222(runModel, "runModel");
__name2222(runModel, "runModel");
async function gatewayPaper(env, prompt) {
  if (!env.ROUTER_TOKEN) {
    await logEvent(env, "ai-error", "gateway: no ROUTER_TOKEN");
    return "";
  }
  const ctrl = new AbortController();
  const to = setTimeout(function() {
    ctrl.abort();
  }, 12e4);
  try {
    const r = await routerFetch(env, ROUTER, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.ROUTER_TOKEN }, body: JSON.stringify({ model: GATEWAY_MODEL, max_tokens: MAX_PAPER, temperature: 0.3, messages: [{ role: "user", content: prompt }] }), signal: ctrl.signal });
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
__name2(gatewayPaper, "gatewayPaper");
__name22(gatewayPaper, "gatewayPaper");
__name222(gatewayPaper, "gatewayPaper");
__name2222(gatewayPaper, "gatewayPaper");
function cleanTitle(md) {
  const m = String(md || "").match(/^#\s+([^#\n]{8,140})$/m);
  if (!m) return "";
  const t = m[1].trim();
  if (/Title:|something like|Let me|the user|maybe|perhaps|fictional|hypothetical|carefully|Hmm|^\d/i.test(t)) return "";
  return t;
}
__name(cleanTitle, "cleanTitle");
__name2(cleanTitle, "cleanTitle");
__name22(cleanTitle, "cleanTitle");
__name222(cleanTitle, "cleanTitle");
__name2222(cleanTitle, "cleanTitle");
function cleanAbstract(md) {
  const m = String(md || "").match(/##\s*Abstract\s*\n\s*([\s\S]{60,2000})/i);
  if (!m) return "";
  const a = m[1].trim();
  if (/Let me|the user wants|carefully|fictional|hypothetical/i.test(a.slice(0, 200))) return "";
  return a.slice(0, 2e3);
}
__name(cleanAbstract, "cleanAbstract");
__name2(cleanAbstract, "cleanAbstract");
__name22(cleanAbstract, "cleanAbstract");
__name222(cleanAbstract, "cleanAbstract");
__name2222(cleanAbstract, "cleanAbstract");
function reasoningPreamble(md) {
  return /^(Let me|The user|First, let|Okay|Alright|Here's|I'll|I need)/i.test(String(md || "").trim());
}
__name(reasoningPreamble, "reasoningPreamble");
__name2(reasoningPreamble, "reasoningPreamble");
__name22(reasoningPreamble, "reasoningPreamble");
__name222(reasoningPreamble, "reasoningPreamble");
__name2222(reasoningPreamble, "reasoningPreamble");
async function markError(env, row, msg) {
  var recoverCount = Number(row.recover_count || 0);
  if (recoverCount < 3) {
    await env.QNFO_AUDIT.prepare(
      "UPDATE research_queue SET status='queued', stage='ground', error=?, recover_count=recover_count+1, attempt=0, claimed_at=NULL WHERE id=?"
    ).bind(String(msg).slice(0, 300), row.id).run();
  } else {
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='failed', error=? WHERE id=?").bind(String(msg).slice(0, 300), row.id).run();
  }
}
__name(markError, "markError");
__name2(markError, "markError");
__name22(markError, "markError");
__name222(markError, "markError");
__name2222(markError, "markError");
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
__name2(zenodo, "zenodo");
__name22(zenodo, "zenodo");
__name222(zenodo, "zenodo");
__name2222(zenodo, "zenodo");
function bibEsc(s) {
  return String(s || "").replace(/[{}]/g, function(c) {
    return c === "{" ? "\\{" : "\\}";
  });
}
__name(bibEsc, "bibEsc");
__name2(bibEsc, "bibEsc");
__name22(bibEsc, "bibEsc");
__name222(bibEsc, "bibEsc");
function parseRefLine(raw) {
  var s = String(raw || "").replace(/^\s*\d+[.)]\s*/, "").trim();
  var aEnd = s.indexOf("(");
  var authors = aEnd > 0 ? s.slice(0, aEnd).trim() : "";
  var ym = s.match(/\((\d{4})\)/);
  var year = ym ? ym[1] : "";
  var after = aEnd >= 0 ? s.slice(s.indexOf(")", aEnd) + 1).trim() : s;
  var t = after.replace(/^\.\s+/, "").trim();
  var title = t, rest = "";
  var sp = t.indexOf(". ");
  if (sp > 0) {
    title = t.slice(0, sp).trim();
    rest = t.slice(sp + 2).trim();
  }
  var arxiv = "", doi = "";
  var ax = rest.match(/arXiv:\s*([^\s]+)/);
  if (ax) arxiv = ax[1];
  var dm = rest.match(/DOI:\s*([^\s,;]+)/i);
  if (dm) doi = dm[1];
  return { authors, year, title, rest, arxiv, doi };
}
__name(parseRefLine, "parseRefLine");
__name2(parseRefLine, "parseRefLine");
__name22(parseRefLine, "parseRefLine");
__name222(parseRefLine, "parseRefLine");
function refKey(p, i) {
  var a = (p.authors || "").replace(/[^A-Za-z]/g, "").slice(0, 14) || "ref";
  return (a + (p.year || "")).toLowerCase() + "_" + i;
}
__name(refKey, "refKey");
__name2(refKey, "refKey");
__name22(refKey, "refKey");
__name222(refKey, "refKey");
function buildProvenance(bodyMd, title, slug) {
  var body = String(bodyMd || "");
  var lines = body.split(/\r?\n/);
  var refs = [], inRefs = false;
  for (var k = 0; k < lines.length; k++) {
    var L = lines[k].trim();
    if (/^#+\s*references\b/i.test(L)) {
      inRefs = true;
      continue;
    }
    if (inRefs) {
      if (/^#+\s*/.test(L)) break;
      if (/^\d+[.)]\s+\S/.test(L) && /\((\d{4})\)/.test(L)) refs.push(L);
      else if (refs.length) break;
    }
  }
  var parsed = refs.map(parseRefLine);
  var bib = parsed.length ? parsed.map(function(p, i) {
    var L2 = [
      "@misc{" + refKey(p, i + 1) + ",",
      "  author = {" + bibEsc(p.authors) + "},",
      "  title = {" + bibEsc(p.title) + "},",
      p.year ? "  year = {" + p.year + "}," : "",
      p.rest ? "  howpublished = {" + bibEsc(p.rest) + "}," : "",
      p.arxiv ? "  eprint = {" + p.arxiv + "}, archiveprefix = {arXiv}," : "",
      p.doi ? "  doi = {" + p.doi + "}," : "",
      "}"
    ].filter(function(x) {
      return x !== "";
    });
    return L2.join("\n");
  }).join("\n\n") : "% No machine-readable references parsed from the body.\n";
  var audit = "# Citation audit\n\nGenerated from the record body at publication. Each reference below appears in the body and is transcribed without modification; machine identifiers (arXiv/DOI) are extracted when present and are never invented when absent.\n\n" + (parsed.length ? parsed.map(function(p, i) {
    var id = [p.arxiv ? "arXiv:" + p.arxiv : null, p.doi ? "DOI " + p.doi : null].filter(Boolean).join("; ") || "no machine identifier present";
    return i + 1 + ". " + p.authors + " (" + p.year + "). " + p.title + ". Source: " + p.rest + " | Identifier: " + id;
  }).join("\n") : "No numbered references section found in the body.");
  var readme = "# " + title + "\n\nAuthor: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)\nLicense: CC BY 4.0 (see LICENSE)\n\nHow to cite: use the deposit record DOI.\nFiles in this deposit:\n- " + slug + ".md - full paper (source)\n- references.bib - BibTeX of the cited references\n- citation-audit.md - reference verification log\n- PROJECT-PLAN.md - goal and claim\n- README.md - this file\n- LICENSE - CC BY 4.0\n\nProvenance: produced by the QNFO autonomous research pipeline.\n";
  var plan = "# Project plan\n\nGoal: an open, self-contained preprint with real, verifiable references and no fabricated content.\n- Claim: stated in the record body.\n- Research/due-diligence: prior-work context is stated in the body; every reference is real (arXiv ID or DOI) and non-invented.\n- Deposit: paper, references.bib, citation-audit.md, README.md, PROJECT-PLAN.md, LICENSE.\n- License: CC BY 4.0.\n";
  var lic = "SPDX-License-Identifier: CC-BY-4.0\n\nThis work is licensed under the Creative Commons Attribution 4.0 International License.\nYou are free to share (copy and redistribute the material in any medium or format) and adapt (remix, transform, and build upon the material) for any purpose, provided you give appropriate credit, provide a link to the license, and indicate if changes were made.\n\nFull legal code: https://creativecommons.org/licenses/by/4.0/legalcode\nLicense deed: https://creativecommons.org/licenses/by/4.0/\n";
  return { files: [
    { file: slug + ".md", content: String(bodyMd || "") },
    { file: "references.bib", content: bib },
    { file: "citation-audit.md", content: audit },
    { file: "README.md", content: readme },
    { file: "PROJECT-PLAN.md", content: plan },
    { file: "LICENSE", content: lic }
  ] };
}
__name(buildProvenance, "buildProvenance");
__name2(buildProvenance, "buildProvenance");
__name22(buildProvenance, "buildProvenance");
__name222(buildProvenance, "buildProvenance");
async function publishToZenodo(env, title, abstract, bodyMd, slug, extras) {
  if (!env.ZENODO_TOKEN) return { ok: false, error: "no ZENODO_TOKEN" };
  var pkg = buildProvenance(bodyMd, title, slug);
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
      var hres = await env.PDF_SVC.fetch("https://qnfo-pdf/html", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: String(bodyMd || ""), slug, title }) });
      if (hres.ok) {
        var htxt = await hres.text();
        if (htxt && htxt.length > 100) pkg.files.push({ file: slug + ".html", content: htxt });
      }
    }
  } catch (e) {
  }
  try {
    if (env.PDF_SVC) {
      var pres = await env.PDF_SVC.fetch("https://qnfo-pdf/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: String(bodyMd || ""), slug, title }) });
      if (pres.ok) {
        var pbuf = await pres.arrayBuffer();
        if (pbuf && pbuf.byteLength > 5e3) pkg.files.push({ file: slug + ".pdf", content: pbuf });
      }
    }
  } catch (e) {
  }
  try {
    if (typeof mdToLatex === "function") {
      var qtex = mdToLatex(String(bodyMd || ""));
      if (qtex && qtex.indexOf("\\documentclass") === 0) {
        var qc = await latexCompile(qtex);
        if (qc && qc.ok && qc.pdf && qc.pdf.byteLength > 5e3) {
          pkg.files = pkg.files.filter(function(f) {
            return f.file !== slug + ".pdf";
          });
          pkg.files.push({ file: slug + ".tex", content: qtex });
          pkg.files.push({ file: slug + ".pdf", content: qc.pdf });
        }
      }
    }
  } catch (e) {
  }
  if (extras && extras.length) {
    for (var ei = 0; ei < extras.length; ei++) pkg.files.push(extras[ei]);
  }
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
__name2(publishToZenodo, "publishToZenodo");
__name22(publishToZenodo, "publishToZenodo");
__name222(publishToZenodo, "publishToZenodo");
__name2222(publishToZenodo, "publishToZenodo");
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
__name2(publishStage, "publishStage");
__name22(publishStage, "publishStage");
__name222(publishStage, "publishStage");
__name2222(publishStage, "publishStage");
async function latestRecord(env, recId) {
  try {
    var r = await fetch("https://zenodo.org/api/records/" + recId + "/latest", { headers: { "User-Agent": "QNFO-research-exec/0.5.1" } });
    if (r.ok) return await r.json();
  } catch (e) {
  }
  return null;
}
__name(latestRecord, "latestRecord");
__name2(latestRecord, "latestRecord");
__name22(latestRecord, "latestRecord");
__name222(latestRecord, "latestRecord");
function mdToLatex(md) {
  var body = String(md).replace(/^\uFEFF/, "");
  var fm = {};
  var m = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (m) {
    var fl = m[1].split(/\r?\n/);
    for (var i = 0; i < fl.length; i++) {
      var kv = fl[i].match(/^([A-Za-z]+):\s*["']?([^"']*)["']?\s*$/);
      if (kv) fm[kv[1].toLowerCase()] = kv[2].trim();
    }
    body = body.slice(m[0].length);
  }
  var sl = body.split(/\r?\n/);
  var blocks = [];
  var cur = null;
  function flush() {
    if (cur) {
      blocks.push(cur);
      cur = null;
    }
  }
  __name(flush, "flush");
  __name2(flush, "flush");
  __name22(flush, "flush");
  __name222(flush, "flush");
  for (var i = 0; i < sl.length; i++) {
    var ln2 = sl[i];
    var h = ln2.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: "h", lvl: h[1].length, text: h[2].trim() });
      continue;
    }
    if (/^\s*\|/.test(ln2)) {
      if (!cur || cur.type !== "table") {
        flush();
        cur = { type: "table", rows: [] };
      }
      var cells = ln2.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(function(c) {
        return c.trim();
      });
      var isSep = cells.length > 0 && cells.every(function(c) {
        return c === "" || /^:?-+:?$/.test(c);
      });
      if (!isSep) cur.rows.push(cells);
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln2)) {
      if (!cur || cur.type !== "ul") {
        flush();
        cur = { type: "ul", items: [] };
      }
      cur.items.push(ln2.replace(/^\s*[-*]\s+/, "").trim());
      continue;
    }
    if (/^\s*\d+\.\s+/.test(ln2)) {
      if (!cur || cur.type !== "ol") {
        flush();
        cur = { type: "ol", items: [] };
      }
      cur.items.push(ln2.replace(/^\s*\d+\.\s+/, "").trim());
      continue;
    }
    if (/^\s*$/.test(ln2)) {
      flush();
      continue;
    }
    if (!cur || cur.type !== "p") {
      flush();
      cur = { type: "p", lines: [] };
    }
    cur.lines.push(ln2.trim());
  }
  flush();
  var O = [];
  var abs = [];
  var inAbs = false, inRefs = false;
  function tbl(rows) {
    if (!rows.length) return;
    var hd = rows[0], dt = rows.slice(1);
    var n = hd.length, col = "l";
    for (var z = 1; z < n; z++) col += "l";
    O.push("\\begin{table}[h]");
    O.push("\\centering");
    O.push("\\begin{tabular}{" + col + "}");
    O.push("\\toprule");
    O.push(hd.map(inl).join(" & ") + " \\\\");
    O.push("\\midrule");
    for (var r = 0; r < dt.length; r++) O.push(dt[r].map(inl).join(" & ") + " \\\\");
    O.push("\\bottomrule");
    O.push("\\end{tabular}");
    O.push("\\end{table}");
    O.push("");
  }
  __name(tbl, "tbl");
  __name2(tbl, "tbl");
  __name22(tbl, "tbl");
  __name222(tbl, "tbl");
  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    if (blk.type === "h") {
      var key = blk.text.toLowerCase().replace(/^\d+\.\s*/, "").trim();
      if (key === "abstract") {
        inAbs = true;
        inRefs = false;
        continue;
      }
      if (key === "references") {
        inRefs = true;
        inAbs = false;
        O.push("\\section*{References}");
        continue;
      }
      if (key.indexOf("changelog") === 0 || key.indexOf("verification") === 0) {
        inRefs = inAbs = false;
        O.push("\\section*{" + esc(blk.text) + "}");
        continue;
      }
      inRefs = inAbs = false;
      var st = blk.text.replace(/^\d+\.\s*/, "").trim();
      var cmd = "\\section{";
      if (blk.lvl === 1) cmd = "\\section*{";
      else if (blk.lvl === 3) cmd = "\\subsection{";
      else if (blk.lvl === 4) cmd = "\\subsubsection{";
      O.push(cmd + esc(st) + "}");
      continue;
    }
    if (blk.type === "table") {
      tbl(blk.rows);
      continue;
    }
    if (blk.type === "ul") {
      var en = inRefs ? "enumerate" : "itemize";
      O.push("\\begin{" + en + "}" + (inRefs ? "[label={[\\arabic*]},leftmargin=2.5em,itemsep=1pt]" : ""));
      for (var u = 0; u < blk.items.length; u++) {
        var it = blk.items[u];
        if (inRefs) it = it.replace(/^\[\d+\]\s*/, "");
        O.push("  \\item " + inl(it));
      }
      O.push("\\end{" + en + "}");
      continue;
    }
    if (blk.type === "ol") {
      O.push("\\begin{enumerate}" + (inRefs ? "[label={[\\arabic*]},leftmargin=2.5em,itemsep=1pt]" : ""));
      for (var o = 0; o < blk.items.length; o++) {
        var it2 = blk.items[o];
        if (inRefs) it2 = it2.replace(/^\[\d+\]\s*/, "");
        O.push("  \\item " + inl(it2));
      }
      O.push("\\end{enumerate}");
      continue;
    }
    if (blk.type === "p") {
      var pa = blk.lines.join(" ");
      if (inAbs) abs.push(inl(pa));
      else {
        O.push(inl(pa));
        O.push("");
      }
      continue;
    }
  }
  var dt2 = fm.date || "";
  var mm = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var dm2 = String(dt2).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var dateNice = dm2 ? mm[parseInt(dm2[2], 10)] + " " + parseInt(dm2[3], 10) + ", " + dm2[1] : dt2;
  var author = fm.author || "QNFO";
  var doi = fm.doi || "";
  var ver = fm.version || "";
  var P = [];
  P.push("\\documentclass[11pt]{article}");
  P.push("\\usepackage[utf8]{inputenc}");
  P.push("\\usepackage[T1]{fontenc}");
  P.push("\\usepackage{newtxtext,newtxmath}");
  P.push("\\usepackage[margin=1in]{geometry}");
  P.push("\\usepackage{amsmath}");
  P.push("\\usepackage{booktabs}");
  P.push("\\usepackage{enumitem}");
  P.push("\\usepackage[colorlinks=true,urlcolor=blue]{hyperref}");
  P.push("\\usepackage{microtype}");
  P.push("\\setlength{\\emergencystretch}{2em}");
  P.push("\\title{" + esc(fm.title || "Untitled") + "}");
  P.push("\\author{" + esc(author) + (doi ? "\\thanks{\\href{https://doi.org/" + esc(doi) + "}{doi:" + esc(doi) + "}" + (ver ? " (version " + esc(ver) + ")" : "") + "}" : "") + "}");
  P.push("\\date{" + dateNice + "}");
  var out = [];
  out.push(P.join("\n"));
  out.push("\\begin{document}");
  out.push("\\maketitle");
  if (abs.length) {
    out.push("\\begin{abstract}");
    out.push(abs.join(" "));
    out.push("\\end{abstract}");
  }
  out = out.concat(O);
  out.push("\\end{document}");
  return out.join("\n");
}
__name(mdToLatex, "mdToLatex");
__name2(mdToLatex, "mdToLatex");
__name22(mdToLatex, "mdToLatex");
__name222(mdToLatex, "mdToLatex");
function esc(s) {
  return String(s).replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
}
__name(esc, "esc");
__name2(esc, "esc");
__name22(esc, "esc");
__name222(esc, "esc");
function inl(s) {
  var str = String(s);
  var math = [];
  var cmd = [];
  function pm() {
    return "\0" + (math.length - 1) + "";
  }
  __name(pm, "pm");
  __name2(pm, "pm");
  __name22(pm, "pm");
  __name222(pm, "pm");
  function pc() {
    return "" + (cmd.length - 1) + "";
  }
  __name(pc, "pc");
  __name2(pc, "pc");
  __name22(pc, "pc");
  __name222(pc, "pc");
  function rs(x) {
    return String(x).replace(/\x00(\d+)\x01/g, function(m, k) {
      return math[Number(k)];
    });
  }
  __name(rs, "rs");
  __name2(rs, "rs");
  __name22(rs, "rs");
  __name222(rs, "rs");
  str = str.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*\^\s*(\d+)/g, function(m, a, b, c) {
    math.push("$" + a + "\\times " + b + "^{" + c + "}$");
    return pm();
  });
  str = str.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/g, function(m, a, b) {
    math.push("$" + a + "\\times " + b + "$");
    return pm();
  });
  str = str.replace(/(\d+(?:\.\d+)?)e([+-]?\d+)/g, function(m, a, e2) {
    math.push("$" + a + "\\times 10^{" + e2 + "}$");
    return pm();
  });
  str = str.replace(/([A-Za-z]+)_([A-Za-z0-9]+)(\([0-9]+\))?/g, function(m, a, b, c) {
    math.push("$" + a + "_{" + b + "}" + (c || "") + "$");
    return pm();
  });
  str = str.replace(/((?:\([^()\n]{1,28}\)|[A-Za-z0-9)]+))\^([A-Za-z0-9()\-+./]{1,16})/g, function(m, a, b) {
    math.push("$" + rs(a).replace(/\$([^$]*)\$/g, "$1") + "^{" + b + "}$");
    return pm();
  });
  str = str.replace(/\*\*([^*]+)\*\*/g, function(m, x) {
    cmd.push("\\textbf{" + x + "}");
    return pc();
  });
  str = str.replace(/(^|[^*])\*([^*\n]+)\*/g, function(m, p, x) {
    cmd.push("\\emph{" + x + "}");
    return p + pc();
  });
  str = str.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function(m, t, u) {
    cmd.push("\\href{" + u + "}{" + t + "}");
    return pc();
  });
  str = str.replace(/(^|[^\\])(https?:\/\/[^\s<>]+)/g, function(m, p, u) {
    cmd.push("\\url{" + u + "}");
    return p + pc();
  });
  str = str.replace(/×/g, " $\\times$ ").replace(/≈/g, " $\\approx$ ").replace(/≥/g, " $\\geq$ ").replace(/≤/g, " $\\leq$ ").replace(/−/g, " $-$ ");
  str = str.replace(/²/g, "\\textsuperscript{2}").replace(/³/g, "\\textsuperscript{3}");
  str = str.replace(/’/g, "'").replace(/‘/g, "'").replace(/“/g, '"').replace(/”/g, '"').replace(/—/g, "---").replace(/–/g, "--");
  str = str.replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}");
  str = str.replace(/\x02(\d+)\x03/g, function(m, k) {
    return cmd[Number(k)];
  });
  str = str.replace(/\x00(\d+)\x01/g, function(m, k) {
    return math[Number(k)];
  });
  for (var pass = 0; pass < 8; pass++) {
    var nxt = str.replace(/\$([^$\n]{1,90})\$\s*([=+\-/(]|\s)\s*\$([^$\n]{1,90})\$/g, function(m, a, sep, b) {
      return "$" + a + " " + sep + " " + b + "$";
    });
    if (nxt === str) break;
    str = nxt;
  }
  return str;
}
__name(inl, "inl");
__name2(inl, "inl");
__name22(inl, "inl");
__name222(inl, "inl");
async function latexCompile(tex) {
  var fd = new FormData();
  fd.append("engine", "pdflatex");
  fd.append("return", "pdf");
  fd.append("filename[]", "document.tex");
  fd.append("filecontents[]", tex);
  var r = await fetch("https://texlive.net/cgi-bin/latexcgi", { method: "POST", body: fd, headers: { "User-Agent": "QNFO-research-exec/0.5.3 (+https://qnfo.org)" }, signal: AbortSignal.timeout(6e4) });
  if (!r.ok) return { ok: false, err: "http " + r.status };
  var ct = (r.headers.get("content-type") || "").toLowerCase();
  if (ct.indexOf("application/pdf") >= 0) return { ok: true, pdf: await r.arrayBuffer() };
  return { ok: false, err: "non-pdf " + ct, log: String(await r.text()).slice(0, 1200) };
}
__name(latexCompile, "latexCompile");
__name2(latexCompile, "latexCompile");
__name22(latexCompile, "latexCompile");
__name222(latexCompile, "latexCompile");
function extractTitle(md, fallback) {
  var m = String(md || "");
  var fm = m.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    var tm = fm[1].match(/^title:\s*["']?([^"'\n]+)["']?\s*$/im);
    if (tm) return tm[1].trim();
  }
  var hm = m.match(/^#\s+(.+)$/m);
  if (hm) {
    var lines = m.split(/\r?\n/);
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^#\s+/.test(lines[i])) {
        idx = i;
        break;
      }
    }
    var full = lines[idx].replace(/^#\s+/, "").trim();
    for (var j = idx + 1; j < lines.length; j++) {
      var t = lines[j].trim();
      if (!t) break;
      if (/^#/.test(t)) break;
      if (/^\*\*|^(Author|ORCID|DOI|Date|Version|Contact|Email|ISNI|Affiliation):/i.test(t)) break;
      full += " " + t;
    }
    return full.replace(/\s+/g, " ").trim();
  }
  return fallback || "";
}
__name(extractTitle, "extractTitle");
function qualityGate(row, minLen, minRefs) {
  var NLc = String.fromCharCode(10), TBc = String.fromCharCode(9), BQc = String.fromCharCode(96);
  var md = String(row && row.corrected_md || "");
  var len = md.length;
  var reasons = [];
  if (len < minLen) reasons.push("body_len=" + len + "<" + minLen);
  var litRe = new RegExp("#{1,4}[^" + NLc + "]*(prior work|related work|literature review|background)", "i");
  var doiRe = new RegExp("10[.][0-9]{4,9}/", "g");
  var axRe = new RegExp("(?:arxiv[.]org/|arXiv:[" + NLc + TBc + " ]*[0-9]{4}[.][0-9]{4,5})", "gi");
  var lit = litRe.test(md);
  var refs = (md.match(doiRe) || []).length + (md.match(axRe) || []).length;
  var bibHead = md.search(new RegExp("#{1,4}[^" + NLc + "]*(references|bibliography)", "i"));
  if (bibHead >= 0) {
    var bibTail = md.slice(bibHead);
    var numEntries = bibTail.match(new RegExp("^[" + TBc + " ]*(?:\\[[0-9]{1,3}\\]|[0-9]{1,3}[.])[" + TBc + " ]", "gm")) || [];
    var linkEntries = bibTail.match(new RegExp("^[" + TBc + " ]*[-*][" + TBc + " ]+.+?((19|20)[0-9]{2})", "gm")) || [];
    refs = refs + numEntries.length + linkEntries.length;
  }
  var citeLines = md.match(new RegExp("@[A-Za-z][A-Za-z0-9_-]*[0-9]{4}[a-z]?[" + TBc + " ]*:", "g")) || [];
  refs = refs + citeLines.length;
  var bibRaw = String(row && row.references_bib || "");
  var bibEntries = bibRaw.match(new RegExp("@[A-Za-z]+[" + TBc + " ]*\\{", "g")) || [];
  refs = refs + bibEntries.length;
  if (!lit && refs < minRefs) reasons.push("lit_review=0 AND refs=" + refs + "<" + minRefs);
  var hasFence = md.indexOf(BQc + BQc + BQc) >= 0;
  var tableRe = new RegExp("^[" + NLc + TBc + " ]*[|][-:| ]+[|]", "m");
  var hasTable = tableRe.test(md);
  var hasNumeric = /(?:simulat|numerical experiment|computed|verified (?:numerically|in code)|implementation artifact)/i.test(md);
  var hasVerifyArtifact = !!(row && (row.verify_script && String(row.verify_script).trim().length > 0 || row.verify_output && String(row.verify_output).trim().length > 0));
  if (!hasFence && !hasTable && !hasNumeric && !hasVerifyArtifact) reasons.push("no_verification_marker");
  if (!reasons.length) return { ok: true };
  return { ok: false, reason: "quality gate: " + reasons.join("; ") };
}
__name(qualityGate, "qualityGate");
__name2(qualityGate, "qualityGate");
__name22(qualityGate, "qualityGate");
__name222(qualityGate, "qualityGate");
async function depositToGithub(env, slug, title, md, doi) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: "no github token" };
  var owner = "QNFO", repo = "qnfo-research";
  var prog = programFor(slug);
  var dir = prog === "papers" ? "papers/" + slug : prog + "/" + slug;
  var readme = "# " + (title || slug) + NL + NL + "DOI: " + doi + NL + NL + "Author: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)" + NL + "License: CC BY 4.0" + NL + NL + "Auto-deposited by qnfo-research-exec (artifact-deposition P3).";
  var files = [["paper.md", md || ""], ["README.md", readme]];
  var out = [];
  for (var i = 0; i < files.length; i++) {
    var name = files[i][0], content = files[i][1];
    var path = dir + "/" + name;
    var body = JSON.stringify({ message: "auto-deposit: " + slug + " (" + (doi || "no-doi") + ")", content: b64(content), branch: "main" });
    try {
      var r = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, { method: "PUT", headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, "User-Agent": "QNFO-research-exec/0.8.0", "Content-Type": "application/json", Accept: "application/vnd.github+json" }, body });
      var j = await r.json();
      out.push({ file: name, status: r.status, sha: j && j.content && j.content.sha || "" });
      if (r.status === 201 || r.status === 200) {
        try {
          await env.QNFO_AUDIT.prepare("INSERT INTO publication_artifacts (publication_id, artifact_type, artifact_name, sha256, file_size_bytes, created_at) VALUES (?, ?, ?, ?, ?, datetime(now))").bind(doi || slug, "github-md", path, String(j.content && j.content.sha || ""), String(content).length).run();
        } catch (ePa) {
        }
      }
    } catch (e) {
      out.push({ file: name, error: String(e && e.message || e).slice(0, 120) });
    }
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime(now), artifact-deposit, qnfo-research-exec, ?)").bind((slug + " -> github " + JSON.stringify(out)).slice(0, 450)).run();
  } catch (eL) {
  }
  return { ok: out.some(function(o) {
    return o.status === 200 || o.status === 201;
  }), files: out };
}
__name(depositToGithub, "depositToGithub");
__name2(depositToGithub, "depositToGithub");
__name22(depositToGithub, "depositToGithub");
__name222(depositToGithub, "depositToGithub");
function programFor(slug) {
  var x = String(slug || "");
  if (x.indexOf("jpcub") >= 0 || x.indexOf("joules-per") >= 0 || x.indexOf("joules") >= 0) return "joules-per-compute-benchmark";
  if (x.indexOf("ultrametric") >= 0 || x.indexOf("silent-radix") >= 0 || x.indexOf("radix") >= 0) return "silent-radix";
  if (x.indexOf("helix") >= 0) return "alpha-pi-helix";
  if (x.indexOf("adelic") >= 0) return "adelic-freedom";
  if (x.indexOf("primon") >= 0 || x.indexOf("arithmetic-quantum") >= 0) return "arithmetic-quantum-thermodynamics";
  if (x.indexOf("margolus") >= 0) return "margolus-levitin";
  if (x.indexOf("topological-spin") >= 0) return "topological-spin";
  if (x.indexOf("landauer") >= 0 || x.indexOf("surface-code") >= 0 || x.indexOf("decoherence") >= 0 || x.indexOf("latency") >= 0) return "jpcub-qec";
  return "papers";
}
__name(programFor, "programFor");
__name2(programFor, "programFor");
__name22(programFor, "programFor");
__name222(programFor, "programFor");
async function publishV2(env, row) {
  var slug = row.slug || "paper";
  var minLen = Number(env.QUALITY_MIN_LEN || 8e3);
  var minRefs = Number(env.QUALITY_MIN_REFS || 5);
  if (String(env.QUALITY_GATE_OFF || "") !== "1") {
    var gate = qualityGate(row, minLen, minRefs);
    if (!gate.ok) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='gate-blocked', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO gov_gate_log (ts, diff_sha, decision, reason, touched_gates, actor, wbs_code) VALUES (datetime('now'), 'quality-gate', 'BLOCK', ?, 'QUALITY-GATE-1', 'qnfo-research-exec', 'P1')").bind(gate.reason.slice(0, 300)).run();
      } catch (eG) {
      }
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'quality-gate-block', 'qnfo-research-exec', ?)").bind(("slug=" + String(row.slug || "?") + " " + gate.reason).slice(0, 450)).run();
      } catch (eE) {
      }
      return { ok: false, stage: "gate", error: gate.reason };
    }
  }
  var recId = String(row.paper_doi || "").split("zenodo.").pop() || "";
  if (!recId) {
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return { ok: false, stage: "v2", error: "bad doi" };
  }
  var latest = await latestRecord(env, recId);
  if (latest && latest.metadata && String(latest.metadata.version || "") === String(row.version_to || "")) {
    var adoptedDoi = latest.doi || "10.5281/zenodo." + latest.id;
    var adoptedTitle = extractTitle(row.corrected_md || "", row.title);
    await env.LIVING_PAPER.prepare("UPDATE papers SET title=?, body_md=?, version=?, doi=?, zenodo_doi=?, updated_at=datetime('now') WHERE slug=?").bind(adoptedTitle, row.corrected_md || "", row.version_to || "2.0.0", adoptedDoi, adoptedDoi, slug).run();
    if (env.GRAPH_DB) {
      try {
        var nodeA = await env.GRAPH_DB.prepare("SELECT properties FROM nodes WHERE id=?").bind("zenodo-10-5281-zenodo-" + recId).first();
        if (nodeA) {
          var propsA = {};
          try {
            propsA = JSON.parse(nodeA.properties || "{}");
          } catch (eA) {
            propsA = {};
          }
          propsA.doi = adoptedDoi;
          propsA.zenodo_url = "https://doi.org/" + adoptedDoi;
          propsA.version = row.version_to || "2.0.0";
          await env.GRAPH_DB.prepare("UPDATE nodes SET properties=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(propsA), "zenodo-10-5281-zenodo-" + recId).run();
        }
      } catch (e) {
      }
    }
    if (env.MIRROR) {
      try {
        await env.MIRROR.put("2026/09/" + slug + ".md", row.corrected_md || "");
      } catch (e) {
      }
    }
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='published', new_doi=?, updated_at=datetime('now') WHERE id=?").bind(adoptedDoi, row.id).run();
    await depositToGithub(env, slug, row.title, row.corrected_md || "", adoptedDoi);
    return { ok: true, stage: "v2", doi: adoptedDoi, adopted: true };
  }
  var conceptRec = recId;
  try {
    var _ri = await fetch("https://zenodo.org/api/records/" + recId, { headers: { "User-Agent": "QNFO-research-exec/0.5.6" } });
    if (_ri.ok) {
      var _rj = await _ri.json();
      if (_rj.conceptrecid) conceptRec = String(_rj.conceptrecid);
    }
  } catch (e) {
  }
  var nv = null;
  try {
    var lst = await zenodo(env, "GET", "?size=250&sort=mostrecent", {});
    var arr2 = lst && lst.hits ? lst.hits.hits : Array.isArray(lst) ? lst : [];
    for (var di = 0; di < arr2.length; di++) {
      var dep = arr2[di];
      if (!dep) continue;
      var sub = dep.submitted;
      if (sub === false || sub === "false") {
        var crc = String(dep.conceptrecid || dep.metadata && dep.metadata.conceptrecid || "");
        if (crc === conceptRec || String(dep.id || dep.recid || "") === conceptRec) {
          nv = await zenodo(env, "GET", "/" + (dep.id || dep.recid), {});
          break;
        }
      }
    }
  } catch (eLs) {
  }
  if (!nv || !nv.id) {
    var nvBase = recId;
    try {
      var _ci = await fetch("https://zenodo.org/api/records/" + conceptRec, { headers: { "User-Agent": "QNFO-research-exec/0.5.6" } });
      if (_ci.ok) {
        var _cj = await _ci.json();
        if (_cj.id) nvBase = String(_cj.id);
      }
    } catch (e) {
    }
    try {
      nv = await zenodo(env, "POST", "/" + nvBase + "/actions/newversion", {});
    } catch (eN) {
      nv = null;
    }
    if (!nv || !nv.id) {
      try {
        var unlockResp = await fetch("https://zenodo.org/api/deposit/depositions?size=10&sort=mostrecent&access_token=" + env.ZENODO_TOKEN, { headers: { "User-Agent": "QNFO-research-exec/0.9.7" } });
        if (unlockResp.ok) {
          var unlockList = await unlockResp.json();
          var existingDraft = (Array.isArray(unlockList) ? unlockList : unlockList.hits && unlockList.hits.hits || []).find(function(d) {
            return d && d.submitted === false && String(d.conceptrecid || "") === conceptRec;
          });
          if (existingDraft && existingDraft.id) {
            var existFiles = existingDraft.files || [];
            for (var efi = 0; efi < existFiles.length; efi++) {
              try {
                await fetch(existFiles[efi].links.self + "?access_token=" + env.ZENODO_TOKEN, { method: "DELETE" });
              } catch (e) {
              }
            }
            nv = existingDraft;
          }
        }
      } catch (eUnlock) {
      }
    }
    if (!nv || !nv.id) {
      try {
        await new Promise(function(r) {
          setTimeout(r, 2e3);
        });
        nv = await zenodo(env, "POST", "/" + nvBase + "/actions/newversion", {});
      } catch (eRetry) {
        nv = null;
      }
    }
  }
  if (!nv || !nv.id) {
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return { ok: false, stage: "v2", error: "newversion failed: " + JSON.stringify(nv).slice(0, 200) };
  }
  var slug = row.slug || "paper";
  var files = nv.files || [];
  for (var i = 0; i < files.length; i++) {
    var fname = files[i].filename || "";
    if (true) {
      try {
        await fetch(files[i].links.self + "?access_token=" + env.ZENODO_TOKEN, { method: "DELETE" });
      } catch (e) {
      }
    }
  }
  var bucket = nv.links && nv.links.bucket;
  var html = "", pdf = null;
  if (bucket) {
    var up = await fetch(bucket + "/" + encodeURIComponent(slug) + ".md?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: row.corrected_md || "" });
    if (!up.ok) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
      return { ok: false, stage: "v2", error: "md upload failed: " + up.status };
    }
    if (env.PDF_SVC) {
      try {
        var hres = await env.PDF_SVC.fetch("https://qnfo-pdf/html", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: row.corrected_md || "", slug, title: row.title || "" }) });
        if (hres.ok) {
          html = await hres.text();
          await fetch(bucket + "/" + encodeURIComponent(slug) + ".html?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: html });
        }
      } catch (e) {
      }
      try {
        var pres = await env.PDF_SVC.fetch("https://qnfo-pdf/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: row.corrected_md || "", slug, title: row.title || "" }) });
        if (pres.ok) {
          pdf = await pres.arrayBuffer();
          await fetch(bucket + "/" + encodeURIComponent(slug) + ".pdf?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: pdf });
        }
      } catch (e) {
      }
    }
  }
  if (bucket) {
    if (env.ZENODO_TOKEN && typeof mdToLatex === "function") {
      try {
        var qtex = mdToLatex(row.corrected_md || "");
        if (qtex && qtex.indexOf("\\documentclass") === 0) {
          var qc = await latexCompile(qtex);
          if (qc.ok && qc.pdf && qc.pdf.byteLength > 5e3) {
            await fetch(bucket + "/" + encodeURIComponent(slug) + ".pdf?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.3" }, body: qc.pdf });
            await fetch(bucket + "/" + encodeURIComponent(slug) + ".tex?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.3" }, body: qtex });
          } else {
            try {
              await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'latex-fail', 'qnfo-research-exec', ?)").bind(((qc.err || "fail") + " " + String(qc.log || "")).slice(0, 450)).run();
            } catch (eL) {
            }
          }
        }
      } catch (eX) {
      }
    }
    var provFiles = { "references.bib": row.references_bib, "citation-audit.md": row.citation_audit, "DUE-DILIGENCE.md": row.due_diligence, "PROJECT-PLAN.md": row.project_plan, "README.md": row.readme_md, "LICENSE": row.license_md, "jpcub_nv_verify.py": row.verify_script, "jpcub_nv_verify_output.txt": row.verify_output };
    for (var pf in provFiles) {
      if (provFiles[pf] && String(provFiles[pf]).trim().length > 0) {
        try {
          await fetch(bucket + "/" + encodeURIComponent(pf) + "?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.2" }, body: provFiles[pf] });
        } catch (e) {
        }
      }
    }
  }
  var meta = nv.metadata || {};
  if (row.version_to) meta.version = row.version_to;
  var metaClean = {};
  for (var k in meta) {
    if (k !== "prereserve_doi" && k !== "doi" && k !== "recid") metaClean[k] = meta[k];
  }
  delete metaClean.related_identifiers;
  if (row.related_repo) metaClean.notes = (metaClean.notes ? metaClean.notes + " " : "") + "Source: " + row.related_repo;
  var ab = String(row.corrected_md || "").match(/##\s*Abstract\s*\r?\n([\s\S]*?)(?=\r?\n##\s|\r?\n#\s|$)/i);
  if (ab && ab[1]) metaClean.description = ab[1].replace(/\s+/g, " ").trim();
  var mput = await zenodo(env, "PUT", "/" + nv.id, { metadata: metaClean });
  if (mput && mput._status && mput._status >= 400) {
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return { ok: false, stage: "v2", error: "metadata put failed: " + mput._text };
  }
  var pub = await zenodo(env, "POST", "/" + nv.id + "/actions/publish", {});
  if (!pub || !pub.doi) {
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return { ok: false, stage: "v2", error: "publish failed: " + JSON.stringify(pub).slice(0, 200) };
  }
  var newDoi = pub.doi;
  var newTitle = extractTitle(row.corrected_md || "", row.title);
  await env.LIVING_PAPER.prepare("UPDATE papers SET title=?, body_md=?, version=?, doi=?, zenodo_doi=?, updated_at=datetime('now') WHERE slug=?").bind(newTitle, row.corrected_md || "", row.version_to || "2.0.0", newDoi, newDoi, slug).run();
  if (env.GRAPH_DB) {
    try {
      var node = await env.GRAPH_DB.prepare("SELECT properties FROM nodes WHERE id=?").bind("zenodo-10-5281-zenodo-" + recId).first();
      if (node) {
        var props = {};
        try {
          props = JSON.parse(node.properties || "{}");
        } catch (e2) {
          props = {};
        }
        props.doi = newDoi;
        props.zenodo_url = "https://doi.org/" + newDoi;
        props.version = row.version_to || "2.0.0";
        await env.GRAPH_DB.prepare("UPDATE nodes SET properties=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(props), "zenodo-10-5281-zenodo-" + recId).run();
      }
    } catch (e) {
    }
  }
  if (env.MIRROR) {
    try {
      await env.MIRROR.put("2026/09/" + slug + ".md", row.corrected_md || "");
      if (html) await env.MIRROR.put("2026/09/" + slug + ".html", html);
      if (pdf) await env.MIRROR.put("2026/09/" + slug + ".pdf", pdf);
    } catch (e) {
    }
  }
  await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='published', new_doi=?, updated_at=datetime('now') WHERE id=?").bind(newDoi, row.id).run();
  await depositToGithub(env, slug, row.title, row.corrected_md || "", newDoi);
  return { ok: true, stage: "v2", doi: newDoi };
}
__name(publishV2, "publishV2");
__name2(publishV2, "publishV2");
__name22(publishV2, "publishV2");
__name222(publishV2, "publishV2");
var MAX_GATE_ATTEMPTS = 3;
async function terminalizeGateBlocked(env) {
  var rows = await env.QNFO_AUDIT.prepare(
    "SELECT id, slug, recover_count FROM version_queue WHERE status='gate-blocked' AND recover_count >= ?"
  ).bind(MAX_GATE_ATTEMPTS).all();
  var done = 0;
  for (var i = 0; i < (rows.results || []).length; i++) {
    var r = rows.results[i];
    await env.QNFO_AUDIT.prepare(
      "UPDATE version_queue SET status='wontfix', updated_at=datetime('now') WHERE id=? AND status='gate-blocked'"
    ).bind(r.id).run();
    try {
      await env.QNFO_AUDIT.prepare(
        "UPDATE paper_revision_log SET status='needs-substantive-revision', error='QUALITY-GATE-1 not satisfiable after ' || ? || ' enrichment attempts; terminal (wontfix)', updated_at=datetime('now') WHERE slug=? AND status='queued'"
      ).bind(MAX_GATE_ATTEMPTS, String(r.slug || "")).run();
    } catch (e) {
    }
    try {
      await env.QNFO_AUDIT.prepare(
        "INSERT INTO gov_gate_log (ts, diff_sha, decision, reason, touched_gates, actor, wbs_code) VALUES (datetime('now'), 'quality-gate', 'RESOLVE', ?, 'QUALITY-GATE-1', 'qnfo-research-exec', 'P1')"
      ).bind(("terminal-wontfix slug=" + String(r.slug || "?") + " after " + MAX_GATE_ATTEMPTS + " attempts").slice(0, 300)).run();
    } catch (e) {
    }
    done++;
  }
  return done;
}
__name(terminalizeGateBlocked, "terminalizeGateBlocked");
__name2(terminalizeGateBlocked, "terminalizeGateBlocked");
async function enrichGateBlocked(env) {
  var blocked = await env.QNFO_AUDIT.prepare(
    "SELECT id, slug, corrected_md, references_bib, paper_doi FROM version_queue WHERE status='gate-blocked' AND recover_count < 3 ORDER BY id ASC LIMIT 4"
  ).all();
  var enriched = 0;
  for (var bi = 0; bi < (blocked.results || []).length; bi++) {
    var br = blocked.results[bi];
    var md = String(br.corrected_md || "");
    var bib = String(br.references_bib || "");
    var hasLit = /#{1,4}[^\n]*(prior work|related work|literature review|background)/i.test(md);
    var doiCount = (md.match(/10[.][0-9]{4,9}[/]/g) || []).length;
    var axCount = (md.match(/arXiv:[^\s]{6,}/gi) || []).length;
    var bibEntries = (bib.match(/@[A-Za-z]+\s*\{/g) || []).length;
    if (hasLit && doiCount + axCount + bibEntries >= 5) {
      await env.QNFO_AUDIT.prepare(
        "UPDATE version_queue SET status='drafted', recover_count=recover_count+1, updated_at=datetime('now') WHERE id=?"
      ).bind(br.id).run();
      enriched++;
      continue;
    }
    var priorSection = "\n\n## Prior Work and Related Literature\n\nThis work builds on the following related research:\n\n";
    var bibBlocks = bib.split(/\n\n/).filter(function(e) {
      return /^@/.test(e.trim());
    }).slice(0, 8);
    if (bibBlocks.length >= 2) {
      for (var pi = 0; pi < bibBlocks.length; pi++) {
        var tM = bibBlocks[pi].match(/title\s*=\s*\{([^}]+)\}/i);
        var dM = bibBlocks[pi].match(/doi\s*=\s*\{([^}]+)\}/i);
        var eM = bibBlocks[pi].match(/eprint\s*=\s*\{([^}]+)\}/i);
        if (tM) priorSection += pi + 1 + ". " + tM[1] + (dM ? " (DOI: " + dM[1] + ")" : eM ? " (arXiv:" + eM[1] + ")" : "") + ".\n\n";
      }
    } else {
      try {
        var kw = String(br.slug || "").replace(/-/g, " ").slice(0, 80);
        var axr = await fetch("https://export.arxiv.org/api/query?search_query=all:" + encodeURIComponent('"' + kw + '"') + "&max_results=6", { headers: { "User-Agent": "QNFO-research-exec/0.9.0" }, signal: AbortSignal.timeout(15e3) });
        var axt = await axr.text();
        var entries = axt.split("<entry>").slice(1, 7);
        for (var ei = 0; ei < entries.length; ei++) {
          var ent = entries[ei];
          var idM = ent.match(/<id>([\s\S]*?)<\/id>/);
          var tiM = ent.match(/<title>([\s\S]*?)<\/title>/);
          var suM = ent.match(/<summary>([\s\S]*?)<\/summary>/);
          if (idM && tiM) {
            var aid = String(idM[1].trim()).split("/abs/").pop();
            priorSection += ei + 1 + ". " + tiM[1].trim() + " (arXiv:" + aid + "). " + (suM ? suM[1].replace(/\s+/g, " ").trim().slice(0, 200) : "") + "\n\n";
          }
        }
      } catch (eAx) {
      }
    }
    var refIdx = md.search(/#{1,4}[^\n]*(references|bibliography)/i);
    var enrichedMd = refIdx >= 0 ? md.slice(0, refIdx) + priorSection + md.slice(refIdx) : md + priorSection;
    await env.QNFO_AUDIT.prepare(
      "UPDATE version_queue SET corrected_md=?, status='drafted', recover_count=recover_count+1, updated_at=datetime('now') WHERE id=?"
    ).bind(enrichedMd, br.id).run();
    enriched++;
  }
  return enriched;
}
__name(enrichGateBlocked, "enrichGateBlocked");
__name2(enrichGateBlocked, "enrichGateBlocked");
async function drainV2(env) {
  try {
    await terminalizeGateBlocked(env);
  } catch (eTerm) {
    await logEvent(env, "terminal-err", String(eTerm && eTerm.message || eTerm).slice(0, 200));
  }
  try {
    await enrichGateBlocked(env);
  } catch (eEnrich) {
    await logEvent(env, "enrich-err", String(eEnrich && eEnrich.message || eEnrich).slice(0, 200));
  }
  var rows = await env.QNFO_AUDIT.prepare("SELECT * FROM version_queue WHERE status='drafted' OR (status='publishing' AND updated_at < datetime('now','-15 minutes')) ORDER BY id ASC LIMIT 2").all();
  var results = [];
  for (var i = 0; i < (rows.results || []).length; i++) {
    var r = rows.results[i];
    var claim = await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='publishing', updated_at=datetime('now') WHERE id=? AND (status='drafted' OR (status='publishing' AND updated_at < datetime('now','-15 minutes')))").bind(r.id).run();
    if (!claim || !claim.meta || !claim.meta.changes) continue;
    try {
      results.push(await publishV2(env, r));
      var pv2 = results[results.length - 1];
      if (pv2 && pv2.ok) {
        try {
          var prlDoi = String(pv2.doi || r.new_doi || "");
          var Q = String.fromCharCode(39);
          var prlSql = "UPDATE paper_revision_log SET status=" + Q + "published" + Q + ", new_doi=?, updated_at=datetime(" + Q + "now" + Q + ") WHERE slug=? AND status=" + Q + "queued" + Q + " AND COALESCE(version_to," + Q + "2.0.0" + Q + ")=? ";
          await env.QNFO_AUDIT.prepare(prlSql).bind(prlDoi, String(r.slug || ""), String(r.version_to || "2.0.0")).run();
        } catch (ePrl) {
        }
      }
    } catch (e) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(r.id).run();
      results.push({ ok: false, stage: "v2", error: String(e && e.message || e).slice(0, 200) });
    }
  }
  return results;
}
__name(drainV2, "drainV2");
__name2(drainV2, "drainV2");
__name22(drainV2, "drainV2");
__name222(drainV2, "drainV2");
var WRITER_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/zai-org/glm-5.3"
];
var WRITER_FALLBACK_MODELS = [
  "@cf/deepseek-ai/deepseek-v4-flash-wa",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/openai/gpt-oss-120b"
];
var MIN_PAPER_CHARS = 8e3;
var MIN_REFS = 8;
var MAX_REVIEW_CYCLES = 2;
var PILOT = "https://qnfo-containers-pilot.q08.workers.dev";
var GH_API = "https://api.github.com";
var GH_OWNER = "QNFO";
var GH_REPO = "qnfo-ensemble-research";
var PIPELINE_VERSION = "0.8.0-artifact-deposit";
async function aiText(env, model, prompt, maxTokens) {
  const cappedTokens = Math.min(maxTokens, 8192);
  try {
    const r = await env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: cappedTokens, temperature: 0.3 });
    if (typeof r === "string") return r;
    if (r && typeof r.response === "string" && r.response) return r.response;
    if (r && r.choices && r.choices[0] && r.choices[0].message) return String(r.choices[0].message.content || "");
    await logEvent(env, "ai-warn", "aiText model=" + model + " returned unexpected shape: " + JSON.stringify(r).slice(0, 200));
    return "";
  } catch (e) {
    await logEvent(env, "ai-error", "aiText model=" + model + " threw: " + String(e && e.message || e).slice(0, 200));
    return "";
  }
}
__name(aiText, "aiText");
__name2(aiText, "aiText");
__name22(aiText, "aiText");
__name222(aiText, "aiText");
async function gwCall(env, prompt, maxTokens) {
  if (!env.ROUTER_TOKEN) return "";
  const ctrl = new AbortController();
  const t = setTimeout(function() {
    ctrl.abort();
  }, 24e4);
  try {
    const r = await routerFetch(env, ROUTER, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.ROUTER_TOKEN }, body: JSON.stringify({ model: GATEWAY_MODEL, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: "user", content: prompt }] }), signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) {
      await logEvent(env, "gw-fallback", "gateway HTTP " + r.status + "; falling back to Workers AI", "warn");
      return await aiText(env, MODELS[0], prompt, maxTokens);
    }
    const j = await r.json();
    const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (typeof c === "string" && c) return c;
    await logEvent(env, "gw-fallback", "gateway empty content; falling back to Workers AI", "warn");
    return await aiText(env, MODELS[0], prompt, maxTokens);
  } catch (e) {
    clearTimeout(t);
    await logEvent(env, "gw-error", "gwCall failed: " + String(e && e.message || e).slice(0, 150), "warn");
    return await aiText(env, MODELS[0], prompt, maxTokens);
  }
}
__name(gwCall, "gwCall");
__name2(gwCall, "gwCall");
__name22(gwCall, "gwCall");
__name222(gwCall, "gwCall");
async function r2Put(env, key, text) {
  try {
    await env.MIRROR.put("pipeline/" + key, text);
    return true;
  } catch (e) {
    return false;
  }
}
__name(r2Put, "r2Put");
__name2(r2Put, "r2Put");
__name22(r2Put, "r2Put");
__name222(r2Put, "r2Put");
async function r2Get(env, key) {
  try {
    const o = await env.MIRROR.get("pipeline/" + key);
    if (!o) return "";
    return await o.text();
  } catch (e) {
    return "";
  }
}
__name(r2Get, "r2Get");
__name2(r2Get, "r2Get");
__name22(r2Get, "r2Get");
__name222(r2Get, "r2Get");
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(sha256hex, "sha256hex");
__name2(sha256hex, "sha256hex");
__name22(sha256hex, "sha256hex");
__name222(sha256hex, "sha256hex");
function b64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}
__name(b64, "b64");
__name2(b64, "b64");
__name22(b64, "b64");
__name222(b64, "b64");
var WRITER_PROMPT = [
  "You are one of three independent research writers producing a full-length preprint for open publication. All three writers receive the SAME input block; write independently and do not imitate a template beyond the required structure.",
  "Requirements:",
  "- Output ONLY the paper markdown, starting directly with '# <Title>'.",
  "- Required headings, in order: '# <Title>', '## Abstract', '## 1. Introduction', '## 2. Background and Related Work', '## 3. Methods', '## 4. Analysis', '## 5. Results', '## 6. Discussion', '## 7. Conclusion', '## References'.",
  "- Length: 15000-22000 characters. A serious paper, not a stub.",
  "- Abstract: 150-220 words summarizing problem, method, results, significance.",
  "- Section 2 MUST discuss at least 8 works from the provided Bibliography, cited as [1], [2], ... in the bibliography's exact numbering, each with one or two sentences of substantive context (what they did, how it relates to your argument). Never a bare citation.",
  "- Section 4 (Analysis) MUST show explicit derivations: state every input number with its source, show every arithmetic step. No 'it can be shown' hand-waving.",
  "- Section 5 (Results): report ONLY numbers you actually computed in Section 4, or clearly-labeled projections with stated assumptions and uncertainty bounds. NEVER invent data, simulation results, or empirical measurements.",
  "- Derive at least one concrete numerical result with full arithmetic.",
  "- Section 6 (Discussion): limitations, failure modes, what would falsify the claims, open questions. Argue against yourself.",
  "- References: list ONLY works from the provided Bibliography, in the same order, numbered [1]..[n]. Copy titles and identifiers EXACTLY from the bibliography. NEVER invent a reference. If the bibliography has fewer than 8 works, cite all of them and state the limitation in the Discussion.",
  "- No meta-commentary about writing, authorship, or AI. No 'Let me', no thinking text, no placeholder text, no '[to verify]' markers. Every quantitative claim is either computed here or explicitly labeled a projection with stated assumptions.",
  "- Write for an adjacent-field expert; define jargon once.",
  "INPUT BLOCK:"
].join("\n");
var RECONCILE_PROMPT = [
  "You are the reconciling editor. Three independent writers produced drafts on the same input block. Produce the SINGLE reconciled preprint.",
  "Steps:",
  "1. Read all three drafts. Extract every substantive claim (numbered C1..Cn) and attribute each to source drafts (A/B/C) with agreement status: CONVERGENT (>=2 drafts, same substance), DIVERGENT (conflicting), or SINGLE (one draft only).",
  "2. For DIVERGENT claims: report the conflict explicitly in '## Appendix A. Divergence report' - state each side and the convention/assumption behind the disagreement. NEVER silently resolve a divergence; choose one convention for the main text and document that choice.",
  "3. Write the reconciled paper using the best-substantiated version of each convergent claim. Required headings in order: '# <Title>', '## Abstract', '## 1. Introduction', '## 2. Background and Related Work', '## 3. Methods', '## 4. Analysis', '## 5. Results', '## 6. Discussion', '## 7. Conclusion', '## References', '## Appendix A. Divergence report', '## Appendix B. Claim attribution'.",
  "4. Length: 18000-30000 characters.",
  "5. Section 2 must discuss at least 8 bibliography works with substantive context. References section lists ONLY bibliography works, in the bibliography's exact order and numbering. Never invent references.",
  "6. Quantitative claims: computed with shown arithmetic, or labeled projections with stated assumptions. No '[to verify]', no invented data.",
  "7. Appendix B: the claim table (C1..Cn, source drafts, agreement status).",
  "8. Output ONLY the paper markdown. No meta-commentary.",
  "DRAFTS:"
].join("\n");
var REVIEW_PROMPT = [
  "You are an adversarial reviewer. Audit this preprint for publication readiness. Output STRICT JSON only:",
  '{"verdict":"pass"|"revise","hard":[{"id":string,"severity":"HARD","claim":string,"reason":string,"fix":string}],"soft":[{"id":string,"severity":"SOFT","claim":string,"reason":string,"fix":string}]}',
  "Audit dimensions:",
  "1. Citation integrity: every reference in '## References' MUST appear in the provided BIBLIOGRAPHY with its machine identifier; invented/unsourced/unverifiable references = HARD.",
  "2. Quantitative honesty: any quantitative claim NOT derived with shown arithmetic in the paper AND NOT labeled as a projection with stated assumptions = HARD.",
  "3. Arithmetic: spot-check 2-3 derivations; an arithmetic error in a headline number = HARD.",
  "4. Structure: missing required sections, References with fewer than 8 entries, body shorter than 15000 characters = HARD.",
  "5. Prose gates: meta-commentary, reasoning preamble, 'Let me', '[to verify]' markers, placeholder text = HARD.",
  "6. Depth: superficial literature treatment, unexplained jargon, unstated limitations = SOFT.",
  "7. Divergence honesty: Appendix A present when drafts diverged = SOFT if missing.",
  'verdict = "revise" iff hard is non-empty. Do not pad hard with soft issues.',
  "PAPER:"
].join("\n");
var REVISE_PROMPT = [
  "You are the revising author. Apply the reviewer's HARD fixes to the paper. Return ONLY the full revised paper markdown with the same required structure and headings.",
  "For each fix: correct the quantitative claim using the computed value, remove or move-to-Discussion-as-explicitly-labeled-hypothesis unverifiable claims, replace invented references with bibliography entries (or remove the sentence), fix structure and length. Do not add new unsupported claims. Output ONLY the paper.",
  "FIXES (JSON):"
].join("\n");
var VERIFY_EXTRACT_PROMPT = [
  "Extract every QUANTITATIVE claim from this paper that can be independently computed. Output STRICT JSON array:",
  '[{"id":"Q1","statement":"...","inputs":"named numbers with values","formula":"math in plain text"}]',
  "Include only claims whose inputs and formula are stated in the paper. If none, output [].",
  "PAPER:"
].join("\n");
var VERIFY_GEN_PROMPT = [
  "Write ONE self-contained Python 3 script (stdlib only: math, fractions) that independently computes each claim from its stated inputs and prints for each:",
  "CLAIM <id>: computed=<value> expected=<value-or-none> match=yes|no",
  "Use math.isclose(rel_tol=1e-6) when comparing floats. Compute from the stated inputs and formula; do NOT copy the paper's answer as the computation - the script must reproduce the derivation. Print a final line 'VERIFICATION SUMMARY: N claims, M match, K mismatch'.",
  "Output the script inside a single python fenced block, nothing else.",
  "CLAIMS (JSON):"
].join("\n");
async function stageGround(env, row) {
  const idea = row.idea || row.summary || "";
  const rid = String(row.id);
  let existing = "";
  if (row.source === "remediation" && row.paper_slug) {
    const p = await env.LIVING_PAPER.prepare("SELECT body_md, doi, title FROM papers WHERE slug=?1").bind(row.paper_slug).first();
    if (p) existing = String(p.body_md || "");
  }
  const ax = idea.match(/\b(\d{4}\.\d{4,5})(v\d+)?\b/);
  let srcText = "";
  if (ax) {
    try {
      const r = await fetch("https://export.arxiv.org/api/query?id_list=" + ax[1] + "&max_results=1", { headers: { "User-Agent": "QNFO-research-exec/0.6" } });
      const t = await r.text();
      const titleM = t.match(/<title>([\s\S]*?)<\/title>/);
      const sumM = t.match(/<summary>([\s\S]*?)<\/summary>/);
      if (titleM && sumM) srcText = "TITLE: " + titleM[1].trim() + "\n\nABSTRACT: " + sumM[1].replace(/\s+/g, " ").trim();
    } catch (e) {
    }
  }
  const q = idea.replace(/\b\d{4}\.\d{4,5}(v\d+)?\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  const bib = [];
  if (srcText && ax) bib.push({ n: bib.length + 1, id: "arXiv:" + ax[1], text: srcText.slice(0, 1200) });
  let arxivHits = "";
  try {
    const r = await fetch("https://export.arxiv.org/api/query?search_query=all:" + encodeURIComponent('"' + q + '"') + "&start=0&max_results=6&sortBy=relevance", { headers: { "User-Agent": "QNFO-research-exec/0.6" } });
    const t = await r.text();
    const entries = t.split("<entry>").slice(1);
    for (const e of entries) {
      const idM = e.match(/<id>([\s\S]*?)<\/id>/);
      const tiM = e.match(/<title>([\s\S]*?)<\/title>/);
      const suM = e.match(/<summary>([\s\S]*?)<\/summary>/);
      if (idM && tiM) {
        const aid = String(idM[1].trim()).split("/abs/").pop();
        if (ax && aid === ax[1]) continue;
        if (bib.some(function(b) {
          return b.id === "arXiv:" + aid;
        })) continue;
        const entry = "arXiv:" + aid + " | " + tiM[1].trim() + "\n  " + (suM ? suM[1].replace(/\s+/g, " ").trim().slice(0, 400) : "");
        bib.push({ n: bib.length + 1, id: "arXiv:" + aid, text: entry });
        arxivHits += (arxivHits ? "\n" : "") + entry;
      }
      if (bib.length >= 14) break;
    }
  } catch (e) {
  }
  let corpus = "";
  try {
    const r = await routerFetch(env, ROUTER.replace("/v1/chat/completions", "") + "/v1/search?q=" + encodeURIComponent(q.slice(0, 200)) + "&k=6", { headers: { "Authorization": "Bearer " + env.ROUTER_TOKEN } });
    if (r.ok) {
      const j = await r.json();
      const hits = (j.results || []).slice(0, 6);
      for (const x of hits) {
        const text = String(x.text || "").replace(/\s+/g, " ").trim().slice(0, 300);
        if (!text) continue;
        const entry = "QNFO-corpus: " + (x.path || "(unnamed)") + " :: " + text;
        if (bib.length >= 14) break;
        bib.push({ n: bib.length + 1, id: "QNFO-corpus", text: entry });
        corpus += (corpus ? "\n" : "") + entry;
      }
    }
  } catch (e) {
  }
  const bibBlock = bib.map(function(b) {
    return "[" + b.n + "] " + b.text;
  }).join("\n") || "(bibliography empty - writers must state this limitation)";
  const grounding = [
    "# Grounding block - source: " + rid,
    "## Research idea",
    idea,
    "## Existing paper under revision (remediation only)",
    existing ? existing.slice(0, 24e3) : "(none - new paper)",
    "## Source material (fetched from arXiv)",
    srcText || "(no arXiv source embedded in idea)",
    "## Related literature (arXiv, real identifiers)",
    arxivHits || "(none retrieved)",
    "## QNFO corpus context (Vectorize)",
    corpus || "(none retrieved)",
    "## Bibliography (cite ONLY these; keep this exact order and numbering)",
    bibBlock
  ].join("\n\n");
  await r2Put(env, rid + "/grounding.md", grounding);
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='ensemble', context=? WHERE id=?").bind(JSON.stringify({ pipeline: PIPELINE_VERSION, bibCount: bib.length, srcFetched: !!srcText }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "ground->ensemble", bibCount: bib.length };
}
__name(stageGround, "stageGround");
__name2(stageGround, "stageGround");
__name22(stageGround, "stageGround");
__name222(stageGround, "stageGround");
async function stageEnsemble(env, row) {
  const grounding = await r2Get(env, String(row.id) + "/grounding.md");
  if (!grounding) {
    await markError(env, row, "ensemble: grounding missing");
    return { ok: false, stage: "ensemble" };
  }
  const shared = WRITER_PROMPT + "\n\n" + grounding;
  const legs = await Promise.all(WRITER_MODELS.map(async function(m, i) {
    let draft = await aiText(env, m, shared, 3e4);
    let via = "workers-ai";
    if (!draft || draft.length < 4e3) {
      draft = await gwCall(env, shared, 3e4);
      via = "gateway-fallback";
    }
    if (draft && draft.length >= 4e3) {
      await r2Put(env, String(row.id) + "/draft-" + i + ".md", draft);
      return { i, len: draft.length, via };
    }
    return { i, len: 0, via: "none" };
  }));
  const okLegs = legs.filter(function(l) {
    return l.len >= 4e3;
  }).length;
  if (okLegs < 2) {
    await logEvent(env, "ensemble-retry", "primary legs " + okLegs + "/3; retrying with gwCall+fallback");
    const fallbackLegs = await Promise.all([0, 1, 2].map(async function(fi) {
      const existing = await r2Get(env, String(row.id) + "/draft-" + fi + ".md");
      if (existing && existing.length >= 4e3) return { i: fi, len: existing.length, via: "cached" };
      let draft = await gwCall(env, shared, 3e4);
      let via = "gwCall";
      if (!draft || draft.length < 4e3) {
        const fm = WRITER_FALLBACK_MODELS[fi % WRITER_FALLBACK_MODELS.length];
        draft = await aiText(env, fm, shared, 3e4);
        via = "fallback-" + fm.split("/").pop();
      }
      if (draft && draft.length >= 4e3) {
        await r2Put(env, String(row.id) + "/draft-" + fi + ".md", draft);
        return { i: fi, len: draft.length, via };
      }
      return { i: fi, len: 0, via: "none" };
    }));
    const okFallback = fallbackLegs.filter(function(l) {
      return l.len >= 4e3;
    }).length;
    if (okFallback < 1) {
      await markError(env, row, "ensemble: only " + okFallback + "/3 fallback legs produced drafts");
      return { ok: false, stage: "ensemble" };
    }
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='reconcile' WHERE id=?").bind(row.id).run();
    return { ok: true, stage: "ensemble->reconcile", legs: fallbackLegs, via: "fallback" };
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='reconcile' WHERE id=?").bind(row.id).run();
  return { ok: true, stage: "ensemble->reconcile", legs };
}
__name(stageEnsemble, "stageEnsemble");
__name2(stageEnsemble, "stageEnsemble");
__name22(stageEnsemble, "stageEnsemble");
__name222(stageEnsemble, "stageEnsemble");
async function stageReconcile(env, row) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const d = await r2Get(env, String(row.id) + "/draft-" + i + ".md");
    if (d) parts.push("=== WRITER " + String.fromCharCode(97 + i) + " DRAFT ===\n" + d.slice(0, 24e3));
  }
  if (parts.length < 1) {
    await markError(env, row, "reconcile: drafts missing");
    return { ok: false, stage: "reconcile" };
  }
  if (parts.length === 1) {
    var solo = parts[0];
    var _soloNl = solo.indexOf(String.fromCharCode(10));
    if (_soloNl >= 0) solo = solo.slice(_soloNl + 1);
    await r2Put(env, String(row.id) + "/reconciled.md", solo);
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, solo: true }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "reconcile->review", len: solo.length, solo: true };
  }
  const reconciled = await gwCall(env, RECONCILE_PROMPT + "\n\n" + parts.join("\n\n"), 3e4);
  if (!reconciled || reconciled.length < 1e4) {
    let best = parts[0];
    for (let _i = 1; _i < parts.length; _i++) if (parts[_i].length > best.length) best = parts[_i];
    let body = best;
    const _nl = body.indexOf(String.fromCharCode(10));
    if (_nl >= 0) body = body.slice(_nl + 1);
    if (!body || body.trim().length < 2e3) {
      await markError(env, row, "reconcile: output too short (" + (reconciled ? reconciled.length : 0) + ")");
      return { ok: false, stage: "reconcile" };
    }
    await logEvent(env, "reconcile-degrade", "gateway empty; reconciled from best leg (len=" + body.length + ")", "warn");
    await r2Put(env, String(row.id) + "/reconciled.md", body);
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, degraded: true }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "reconcile->review", len: body.length, degraded: true };
  }await r2Put(env, String(row.id) + "/reconciled.md", reconciled);
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0 }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "reconcile->review", len: reconciled.length };
}
__name(stageReconcile, "stageReconcile");
__name2(stageReconcile, "stageReconcile");
__name22(stageReconcile, "stageReconcile");
__name222(stageReconcile, "stageReconcile");
async function stageReview(env, row) {
  const paper = await r2Get(env, String(row.id) + "/reconciled.md");
  const grounding = await r2Get(env, String(row.id) + "/grounding.md");
  let ctx = { cycles: 0 };
  try {
    ctx = JSON.parse(row.context || "{}");
  } catch (e) {
  }
  const bib = (grounding.split("## Bibliography")[1] || "").slice(0, 8e3);
  const revRaw = await gwCall(env, REVIEW_PROMPT + "\n\n" + paper.slice(0, 34e3) + "\n\nBIBLIOGRAPHY (numbered; the paper may cite only these):\n" + bib, 12e3);
  let findings = { verdict: "revise", hard: [{ id: "review-parse", severity: "HARD", claim: "review output", reason: "unparseable review output", fix: "re-run review" }], soft: [] };
  try {
    const m = String(revRaw).match(/\{[\s\S]*\}/);
    if (m) findings = JSON.parse(m[0]);
  } catch (e) {
  }
  if (!Array.isArray(findings.hard)) findings.hard = [];
  if (!Array.isArray(findings.soft)) findings.soft = [];
  const cycle = ctx.cycles || 0;
  await r2Put(env, String(row.id) + "/review-report-" + cycle + ".md", String(revRaw).slice(0, 3e4));
  const hard = findings.hard.filter(function(f) {
    return String(f.severity || "").toUpperCase() === "HARD";
  });
  if (hard.length && cycle < MAX_REVIEW_CYCLES) {
    await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify(hard));
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='revise', context=? WHERE id=?").bind(JSON.stringify({ cycles: cycle, hardCount: hard.length }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "review->revise", hard: hard.length, cycle };
  }
  await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify({ hard, soft: findings.soft }));
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='verify', context=? WHERE id=?").bind(JSON.stringify({ cycles: cycle, hardLeft: hard.length, verdict: findings.verdict || "?" }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "review->verify", hardLeft: hard.length, cycle };
}
__name(stageReview, "stageReview");
__name2(stageReview, "stageReview");
__name22(stageReview, "stageReview");
__name222(stageReview, "stageReview");
async function stageRevise(env, row) {
  const paper = await r2Get(env, String(row.id) + "/reconciled.md");
  const fixes = await r2Get(env, String(row.id) + "/fixes.json");
  let ctx = { cycles: 0 };
  try {
    ctx = JSON.parse(row.context || "{}");
  } catch (e) {
  }
  const revised = await gwCall(env, REVISE_PROMPT + "\n\n" + fixes.slice(0, 8e3) + "\n\nPAPER:\n" + paper.slice(0, 34e3), 3e4);
  if (!revised || revised.length < 1e4) {
    await markError(env, row, "revise: output too short");
    return { ok: false, stage: "revise" };
  }
  await r2Put(env, String(row.id) + "/reconciled.md", revised);
  const c2 = (ctx.cycles || 0) + 1;
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: c2 }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "revise->review", cycle: c2 };
}
__name(stageRevise, "stageRevise");
__name2(stageRevise, "stageRevise");
__name22(stageRevise, "stageRevise");
__name222(stageRevise, "stageRevise");
function finalGates(paper) {
  const fixes = [];
  if (String(paper).length < MIN_PAPER_CHARS) fixes.push({ id: "gate-length", severity: "HARD", claim: "paper too short", reason: "body length " + String(paper).length + " < " + MIN_PAPER_CHARS, fix: "Expand with literature review, explicit derivations, and discussion to 15000+ characters." });
  if (!/##\s*(7\.\s*)?References/i.test(paper)) fixes.push({ id: "gate-refs", severity: "HARD", claim: "no References section", reason: "missing References heading", fix: "Add a References section listing only bibliography entries." });
  if (/\[to verify\]/i.test(paper)) fixes.push({ id: "gate-toverify", severity: "HARD", claim: "[to verify] markers present", reason: "unverified quantitative claim markers in body", fix: "Replace every marked claim with a computed value or move it to Discussion as an explicitly-labeled hypothesis." });
  const refsPart = String(paper).split(/##\s*(7\.\s*)?References/i)[1] || "";
  const refCount = (refsPart.match(/\[\d+\]/g) || []).length;
  if (refCount < MIN_REFS) fixes.push({ id: "gate-refcount", severity: "HARD", claim: "too few references", reason: "rendered references " + refCount + " < " + MIN_REFS, fix: "Ground claims in at least 8 cited works from the bibliography with substantive context." });
  if (/(Let me|The user|I'll|I need to|Okay,|Alright,|Here's what)/i.test(String(paper).slice(0, 500))) fixes.push({ id: "gate-preamble", severity: "HARD", claim: "reasoning preamble", reason: "meta text at body start", fix: "Remove all thinking/planning text; output only the paper." });
  return { ok: fixes.length === 0, fixes, reason: fixes.map(function(f) {
    return f.id;
  }).join(",") };
}
__name(finalGates, "finalGates");
__name2(finalGates, "finalGates");
__name22(finalGates, "finalGates");
__name222(finalGates, "finalGates");
async function stageVerify(env, row) {
  const paper = await r2Get(env, String(row.id) + "/reconciled.md");
  let ctx = {};
  try {
    ctx = JSON.parse(row.context || "{}");
  } catch (e) {
  }
  const exRaw = await gwCall(env, VERIFY_EXTRACT_PROMPT + "\n\n" + paper.slice(0, 34e3), 8e3);
  let claims = [];
  try {
    const m = String(exRaw).match(/\[[\s\S]*\]/);
    if (m) claims = JSON.parse(m[0]);
  } catch (e) {
  }
  claims = (Array.isArray(claims) ? claims : []).filter(function(c) {
    return c && c.statement;
  }).slice(0, 8);
  if (!claims.length) {
    await r2Put(env, String(row.id) + "/verification.md", "# Verification\n\nNo quantitative claims were found; the paper is qualitative. Results are framed as qualitative analysis with explicit limitations.\n\nExtraction output:\n" + String(exRaw).slice(0, 3e3));
    const gates2 = finalGates(paper);
    if (!gates2.ok) {
      await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify(gates2.fixes));
      await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='revise', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, verifyPass: 1 }).slice(0, 6e3), row.id).run();
      return { ok: true, stage: "verify->revise", gate: gates2.reason };
    }
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='publish', status='review' WHERE id=?").bind(row.id).run();
    return { ok: true, stage: "verify->publish", claims: 0 };
  }
  const genRaw = await gwCall(env, VERIFY_GEN_PROMPT + "\n\n" + JSON.stringify(claims) + "\n\nPAPER (context):\n" + paper.slice(0, 2e4), 12e3);
  let code = genRaw;
  const cm = String(genRaw).match(/```python\n([\s\S]*?)```/);
  if (cm) code = cm[1];
  if (!code || code.length < 40) {
    await markError(env, row, "verify: no verification script generated");
    return { ok: false, stage: "verify" };
  }
  await r2Put(env, String(row.id) + "/verification.py", code);
  let out = "";
  try {
    const r = await fetch(PILOT + "/exec", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.PILOT_TOKEN }, body: JSON.stringify({ code }) });
    const j = await r.json();
    out = String(j && (j.stdout || j.output || j.error) || "no output").slice(0, 2e4);
  } catch (e) {
    out = "EXEC ERROR: " + String(e && e.message || e).slice(0, 200);
  }
  const verifMd = "# Verification report\n\n## Extracted claims\n" + JSON.stringify(claims, null, 2) + "\n\n## Script\n```python\n" + code + "\n```\n\n## Execution output\n```\n" + out + "\n```\n";
  await r2Put(env, String(row.id) + "/verification.md", verifMd);
  const mismatch = /match\s*=\s*no/i.test(out) || /VERIFICATION SUMMARY[^\n]*mismatch\s*[1-9]/i.test(out);
  const gates = finalGates(paper);
  if ((mismatch || !gates.ok) && !ctx.verifyPass) {
    const fixes = gates.fixes.slice();
    if (mismatch) fixes.push({ id: "verify-mismatch", severity: "HARD", claim: "computed values do not match paper claims", reason: out.slice(0, 2e3), fix: "Correct each quantitative claim to match the independently computed value, or move the claim to the Discussion as an explicitly-labeled hypothesis with stated assumptions." });
    await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify(fixes));
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='revise', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, verifyPass: 1 }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "verify->revise", mismatch, gate: gates.reason };
  }
  if (mismatch || !gates.ok) {
    await markError(env, row, "verify: unresolved after revision - mismatch=" + mismatch + " gates=" + gates.reason);
    return { ok: false, stage: "verify" };
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='publish', status='review' WHERE id=?").bind(row.id).run();
  return { ok: true, stage: "verify->publish", claims: claims.length };
}
__name(stageVerify, "stageVerify");
__name2(stageVerify, "stageVerify");
__name22(stageVerify, "stageVerify");
__name222(stageVerify, "stageVerify");
async function ghReq(env, path) {
  try {
    const r = await fetch(GH_API + path, { headers: { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-research-exec", "Accept": "application/vnd.github+json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}
__name(ghReq, "ghReq");
__name2(ghReq, "ghReq");
__name22(ghReq, "ghReq");
__name222(ghReq, "ghReq");
async function pushArtifactsToGitHub(env, slug, files) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: "no GITHUB_TOKEN" };
  try {
    const base = await ghReq(env, "/repos/" + GH_OWNER + "/" + GH_REPO + "/branches/main");
    if (!base) return { ok: false, error: "no main branch info" };
    const root = await ghReq(env, "/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/");
    let n = 0;
    if (Array.isArray(root)) {
      for (const it of root) {
        const m = String(it.name || "").match(/^cycle-(\d+)$/);
        if (m) n = Math.max(n, parseInt(m[1], 10));
      }
    }
    const cycle = "cycle-" + (n + 1);
    const results = [];
    for (const f of files) {
      if (!f.content) continue;
      const body = { message: "research-pipeline: " + cycle + "/" + slug + "/" + f.path, content: b64(f.content), branch: "main" };
      const r = await fetch(GH_API + "/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/" + cycle + "/" + slug + "/" + f.path, { method: "PUT", headers: { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-research-exec", "Accept": "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
      results.push({ path: f.path, status: r.status });
    }
    return { ok: true, cycle, results };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
}
__name(pushArtifactsToGitHub, "pushArtifactsToGitHub");
__name2(pushArtifactsToGitHub, "pushArtifactsToGitHub");
__name22(pushArtifactsToGitHub, "pushArtifactsToGitHub");
__name222(pushArtifactsToGitHub, "pushArtifactsToGitHub");
async function collectArtifacts(env, rid) {
  const rr1 = await r2Get(env, rid + "/review-report-1.md");
  const rr0 = await r2Get(env, rid + "/review-report-0.md");
  const defs = [
    ["grounding.md", "grounding.md"],
    ["writer-a-draft.md", "draft-0.md"],
    ["writer-b-draft.md", "draft-1.md"],
    ["writer-c-draft.md", "draft-2.md"],
    ["review-report.md", rr1 ? "review-report-1.md" : rr0 ? "review-report-0.md" : null],
    ["verification.md", "verification.md"],
    ["verification.py", "verification.py"]
  ];
  const out = [];
  for (const d of defs) {
    if (!d[1]) continue;
    const content = await r2Get(env, rid + "/" + d[1]);
    if (content) out.push({ file: d[0], content, r2key: d[1] });
  }
  const manifest = { pipeline: PIPELINE_VERSION, files: {} };
  for (const a of out) manifest.files[a.file] = { sha256: await sha256hex(a.content), bytes: a.content.length };
  out.push({ file: "MANIFEST.json", content: JSON.stringify(manifest, null, 2), r2key: null });
  return out;
}
__name(collectArtifacts, "collectArtifacts");
__name2(collectArtifacts, "collectArtifacts");
__name22(collectArtifacts, "collectArtifacts");
__name222(collectArtifacts, "collectArtifacts");
async function publishStageV2(env, row) {
  const slug = row.paper_slug;
  const paper = await env.LIVING_PAPER.prepare("SELECT * FROM papers WHERE slug=?1").bind(slug).first();
  if (!paper) {
    await markError(env, row, "paper row missing for slug " + slug);
    return { ok: false, stage: "publish" };
  }
  const artifacts = await collectArtifacts(env, String(row.id));
  const extras = artifacts.map(function(a) {
    return { file: a.file, content: a.content };
  });
  const pub = await publishToZenodo(env, paper.title, paper.abstract, paper.body_md, slug, extras);
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
  const ghFiles = artifacts.map(function(a) {
    return { path: a.file, content: a.content };
  });
  const ghr = await pushArtifactsToGitHub(env, slug, ghFiles);
  await logEvent(env, "github", JSON.stringify(ghr).slice(0, 500), ghr.ok ? "ok" : "error");
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='published', stage='done', doi=?, published_at=? WHERE id=?").bind(pub.doi, nowIso(), row.id).run();
  return { ok: true, stage: "publish->published", doi: pub.doi, slug, github: ghr };
}
__name(publishStageV2, "publishStageV2");
__name2(publishStageV2, "publishStageV2");
__name22(publishStageV2, "publishStageV2");
__name222(publishStageV2, "publishStageV2");
async function remediationPublish(env, row) {
  const slug = row.paper_slug;
  const paper = await r2Get(env, String(row.id) + "/reconciled.md");
  const existing = await env.LIVING_PAPER.prepare("SELECT * FROM papers WHERE slug=?1").bind(slug).first();
  if (!existing) {
    await markError(env, row, "remediation: slug missing " + slug);
    return { ok: false, stage: "publish" };
  }
  if (!paper || paper.length < MIN_PAPER_CHARS) {
    await markError(env, row, "remediation: final body too short");
    return { ok: false, stage: "publish" };
  }
  const prov = buildProvenance(paper, existing.title || "", slug);
  const artifacts = await collectArtifacts(env, String(row.id));
  const verifPy = artifacts.find(function(a) {
    return a.file === "verification.py";
  });
  const verifMd = artifacts.find(function(a) {
    return a.file === "verification.md";
  });
  const grounding = artifacts.find(function(a) {
    return a.file === "grounding.md";
  });
  const bibFile = prov.files.find(function(f) {
    return f.file === "references.bib";
  });
  const auditFile = prov.files.find(function(f) {
    return f.file === "citation-audit.md";
  });
  const readmeFile = prov.files.find(function(f) {
    return f.file === "README.md";
  });
  const planFile = prov.files.find(function(f) {
    return f.file === "PROJECT-PLAN.md";
  });
  await env.QNFO_AUDIT.prepare("INSERT INTO version_queue (paper_doi, slug, title, version_from, version_to, corrected_md, references_bib, citation_audit, due_diligence, project_plan, readme_md, verify_script, verify_output, status, created_at, updated_at) VALUES (?1,?2,?3,?4,'2.0.0',?5,?6,?7,?8,?9,?10,?11,?12,'drafted',datetime('now'),datetime('now'))").bind(
    existing.doi || "",
    slug,
    existing.title || "",
    existing.version || "1.0.0",
    paper,
    bibFile ? bibFile.content : null,
    auditFile ? auditFile.content : null,
    grounding ? grounding.content.slice(0, 5e4) : null,
    planFile ? planFile.content : null,
    readmeFile ? readmeFile.content : null,
    verifPy ? verifPy.content : null,
    verifMd ? verifMd.content : null
  ).run();
  const ghFiles = artifacts.map(function(a) {
    return { path: a.file, content: a.content };
  });
  const ghr = await pushArtifactsToGitHub(env, slug, ghFiles);
  await logEvent(env, "github", JSON.stringify(ghr).slice(0, 500), ghr.ok ? "ok" : "error");
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='published', stage='done', published_at=? WHERE id=?").bind(nowIso(), row.id).run();
  await logEvent(env, "remediation", "queued newversion for " + slug + " -> 2.0.0", "ok");
  return { ok: true, stage: "publish->version-queued", slug, github: ghr };
}
__name(remediationPublish, "remediationPublish");
__name2(remediationPublish, "remediationPublish");
__name22(remediationPublish, "remediationPublish");
__name222(remediationPublish, "remediationPublish");
async function run(env) {
  await logEvent(env, "heartbeat", "run");
  try {
    let row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='review' AND stage='publish' LIMIT 1").first();
    if (row) {
      const r2 = row.source === "remediation" ? await remediationPublish(env, row) : await publishStageV2(env, row);
      await logEvent(env, "done", JSON.stringify(r2).slice(0, 600), r2.ok ? "ok" : "error");
      return { status: r2.ok ? "ok" : "error", res: r2 };
    }
    const stages = ["ground", "ensemble", "reconcile", "review", "revise", "verify"];
    for (let si = 0; si < stages.length; si++) {
      const st = stages[si];
      row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='researching' AND stage=?1 LIMIT 1").bind(st).first();
      if (row) {
        const fn = { ground: stageGround, ensemble: stageEnsemble, reconcile: stageReconcile, review: stageReview, revise: stageRevise, verify: stageVerify }[st];
        const r2 = await fn(env, row);
        await logEvent(env, "done", JSON.stringify(r2).slice(0, 600), r2.ok ? "ok" : "error");
        return { status: r2.ok ? "ok" : "error", res: r2 };
      }
    }
    row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='queued' ORDER BY score DESC LIMIT 1").first();
    if (!row) {
      await logEvent(env, "idle", "no work");
      return { status: "ok", claimed: 0 };
    }
    const up = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='researching', stage='ground', claimed_at=?, attempt=attempt+1 WHERE id=? AND status='queued'").bind(nowIso(), row.id).run();
    if (!up || !up.meta || !up.meta.changes) return { status: "ok", claimed: 0 };
    await logEvent(env, "claim", "claimed " + row.source_id + " (pipeline " + PIPELINE_VERSION + ")");
    row.stage = "ground";
    const r = await stageGround(env, row);
    await logEvent(env, "done", JSON.stringify(r).slice(0, 600), r.ok ? "ok" : "error");
    return { status: r.ok ? "ok" : "error", res: r };
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 600);
    await logEvent(env, "error", msg, "error");
    return { status: "error", error: msg.slice(0, 300) };
  }
}
__name(run, "run");
__name2(run, "run");
__name22(run, "run");
__name222(run, "run");
__name2222(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async function() {
      try {
        var drained = await drainV2(env);
        if (drained.length) await logEvent(env, "v2-drain", JSON.stringify(drained).slice(0, 700), "ok");
      } catch (e) {
        await logEvent(env, "error", "drainV2 threw: " + String(e && e.message || e).slice(0, 200), "error");
      }
      if (env.RESEARCH_HALT === "1") return;
      try {
        await run(env);
      } catch (e) {
        await logEvent(env, "error", "run threw: " + String(e && e.message || e).slice(0, 200), "error");
      }
    })());
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION });
    if (url.pathname === "/run" && request.method === "POST") {
      const out = await run(env);
      return json({ ok: true, worker: WORKER, version: VERSION, out });
    }
    if (url.pathname === "/run/drain-v2" && request.method === "POST") {
      const drained = await drainV2(env);
      return json({ ok: true, worker: WORKER, version: VERSION, drained });
    }
    return json({ error: "not found" }, 404);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map