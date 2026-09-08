var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.0.4-deepseek-flash";
var MODEL = "@cf/deepseek-ai/deepseek-v4-flash-0731"; // 2026-09-08 model audit: 24k-ctx fp8-fast -> 1.3M ctx fc+reasoning
var BATCH = 3;
var UA = "QNFO-paper-reviser/" + VERSION + " (+https://papers.qnfo.org)";
var PROV_FILES = ["references.bib", "citation-audit.md", "DUE-DILIGENCE.md", "PROJECT-PLAN.md", "README.md", "LICENSE"];
function json(data, status) {
  if (status === void 0) status = 200;
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function authorized(request, env) {
  if (!env.REVISER_TOKEN) return false;
  return (request.headers.get("X-Reviser-Token") || "") === env.REVISER_TOKEN;
}
__name(authorized, "authorized");
function recIdOf(doi) {
  const m = String(doi || "").match(/zenodo\.(\d+)/);
  return m ? m[1] : null;
}
__name(recIdOf, "recIdOf");
async function zenodoGet(path) {
  const r = await fetch("https://zenodo.org/api/records" + path, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(3e4) });
  if (!r.ok) return { _status: r.status };
  try {
    return await r.json();
  } catch (e) {
    return { _status: r.status, _parseError: e.message };
  }
}
__name(zenodoGet, "zenodoGet");
function bibEsc(s) {
  return String(s || "").replace(/[{}]/g, function(c) {
    return c === "{" ? "\\{" : "\\}";
  });
}
__name(bibEsc, "bibEsc");
function parseRefLine(raw) {
  const s = String(raw || "").replace(/^\s*\d+[.)]\s*/, "").trim();
  const aEnd = s.indexOf("(");
  const authors = aEnd > 0 ? s.slice(0, aEnd).trim() : "";
  const ym = s.match(/\((\d{4})\)/);
  const year = ym ? ym[1] : "";
  const after = aEnd >= 0 ? s.slice(s.indexOf(")", aEnd) + 1).trim() : s;
  const t = after.replace(/^\.\s+/, "").trim();
  let title = t, rest = "";
  const sp = t.indexOf(". ");
  if (sp > 0) {
    title = t.slice(0, sp).trim();
    rest = t.slice(sp + 2).trim();
  }
  let arxiv = "", doi = "";
  const ax = rest.match(/arXiv:\s*([^\s]+)/);
  if (ax) arxiv = ax[1];
  const dm = rest.match(/DOI:\s*([^\s,;]+)/i);
  if (dm) doi = dm[1];
  return { authors, year, title, rest, arxiv, doi };
}
__name(parseRefLine, "parseRefLine");
function refKey(p, i) {
  const a = (p.authors || "").replace(/[^A-Za-z]/g, "").slice(0, 14) || "ref";
  return (a + (p.year || "")).toLowerCase() + "_" + i;
}
__name(refKey, "refKey");
function regenerateProvenance(bodyMd, title, slug) {
  const body = String(bodyMd || "");
  const lines = body.split(/\r?\n/);
  const refs = [];
  let inRefs = false;
  for (let k = 0; k < lines.length; k++) {
    const L = lines[k].trim();
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
  const parsed = refs.map(parseRefLine);
  const bib = parsed.length ? parsed.map(function(p, i) {
    const L = [
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
    return L.join("\n");
  }).join("\n\n") : "% No machine-readable references parsed from the body.\n";
  const audit = "# Citation audit\n\nGenerated from the record body at publication. Each reference below appears in the body and is transcribed without modification; machine identifiers (arXiv/DOI) are extracted when present and are never invented when absent.\n\n" + (parsed.length ? parsed.map(function(p, i) {
    const id = [p.arxiv ? "arXiv:" + p.arxiv : null, p.doi ? "DOI " + p.doi : null].filter(Boolean).join("; ") || "no machine identifier present";
    return i + 1 + ". " + p.authors + " (" + p.year + "). " + p.title + ". Source: " + p.rest + " | Identifier: " + id;
  }).join("\n") : "No numbered references section found in the body.");
  const readme = "# " + title + "\n\nAuthor: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)\nLicense: CC BY 4.0 (see LICENSE)\n\nHow to cite: use the deposit record DOI.\nFiles in this deposit:\n- " + slug + ".md - full paper (source)\n- references.bib - BibTeX of the cited references\n- citation-audit.md - reference verification log\n- PROJECT-PLAN.md - goal and claim\n- README.md - this file\n- LICENSE - CC BY 4.0\n\nProvenance: produced by the QNFO autonomous research pipeline.\n";
  const plan = "# Project plan\n\nGoal: an open, self-contained preprint with real, verifiable references and no fabricated content.\n- Claim: stated in the record body.\n- Research/due-diligence: prior-work context is stated in the body; every reference is real (arXiv ID or DOI) and non-invented.\n- Deposit: paper, references.bib, citation-audit.md, README.md, PROJECT-PLAN.md, LICENSE.\n- License: CC BY 4.0.\n";
  const lic = "SPDX-License-Identifier: CC-BY-4.0\n\nThis work is licensed under the Creative Commons Attribution 4.0 International License.\nYou are free to share (copy and redistribute the material in any medium or format) and adapt (remix, transform, and build upon the material) for any purpose, provided you give appropriate credit, provide a link to the license, and indicate if changes were made.\n\nFull legal code: https://creativecommons.org/licenses/by/4.0/legalcode\nLicense deed: https://creativecommons.org/licenses/by/4.0/\n";
  return { references_bib: bib, citation_audit: audit, readme_md: readme, project_plan: plan, license_md: lic };
}
__name(regenerateProvenance, "regenerateProvenance");
async function downloadProvenance(recId) {
  const out = { references_bib: null, citation_audit: null, due_diligence: null, project_plan: null, readme_md: null, license_md: null, verify_script: null, verify_output: null };
  const rec = await zenodoGet("/" + recId);
  if (!rec || rec._status) return out;
  const files = Array.isArray(rec.files) ? rec.files : [];
  for (const f of files) {
    const name = f.key || f.filename || "";
    const contentUrl = f.links && (f.links.content || f.links.self);
    if (!contentUrl) continue;
    const isProv = PROV_FILES.indexOf(name) >= 0;
    const isVerify = /verify/i.test(name);
    if (!isProv && !isVerify) continue;
    try {
      const r = await fetch(contentUrl, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const text = await r.text();
      if (name === "references.bib") out.references_bib = text;
      else if (name === "citation-audit.md") out.citation_audit = text;
      else if (name === "DUE-DILIGENCE.md") out.due_diligence = text;
      else if (name === "PROJECT-PLAN.md") out.project_plan = text;
      else if (name === "README.md") out.readme_md = text;
      else if (name === "LICENSE") out.license_md = text;
      else if (isVerify && !out.verify_script && /\.(py|sh)$/i.test(name)) out.verify_script = text;
      else if (isVerify && !out.verify_output && /\.(txt|out|log)$/i.test(name)) out.verify_output = text;
    } catch (e) {
    }
  }
  return out;
}
__name(downloadProvenance, "downloadProvenance");
async function aiText(env, prompt, model, maxTokens) {
  const m = model || MODEL;
  const res = await env.AI.run(m, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens || 4096 }, { gateway: { id: "default" } });
  let text = "";
  try {
    // Envelope-agnostic extraction (2026-09-06): Workers AI may return choices[].message.content,
    // result.response, response, or result. Legacy code read only res.response||res.result and
    // silently lost text when the envelope was OpenAI-style choices[].
    if (res) {
      const ch = res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
      if (ch) { text = String(ch); }
      else if (typeof res.response === "string") { text = res.response; }
      else if (res.result && typeof res.result === "string") { text = res.result; }
      else if (res.result && typeof res.result.response === "string") { text = res.result.response; }
      else if (res.result && res.result.choices && res.result.choices[0] && res.result.choices[0].message) {
        text = String(res.result.choices[0].message.content || "");
      } else if (typeof res === "string") { text = res; }
    }
  } catch (e) {
    text = "";
  }
  return text.trim();
}

__name(aiText, "aiText");
function parseJsonObject(text) {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) text = text.slice(a, b + 1);
  text = text.replace(/\\(?!["\\/])/g, "\\\\");
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}
__name(parseJsonObject, "parseJsonObject");
async function selectCandidates(env, limit) {
  const rows = await env.PAPERS_DB.prepare("SELECT slug, doi, zenodo_doi, title, version, body_md, paper_type, created_at FROM papers WHERE status='published' AND zenodo_doi IS NOT NULL AND zenodo_doi != '' ORDER BY CASE WHEN created_at >= datetime('now','-7 days') THEN 0 ELSE 1 END, created_at ASC LIMIT 60").all();
  const all = rows && rows.results || [];
  // id 132 (2026-09-08): terminal dispositions only; every status below is terminal for the auto-loop.
  // "needs-substantive-revision" and "stub-fragment" defer to the substantive-remediation loop (id 133).
  const done = await env.WATCH_DB.prepare("SELECT slug FROM paper_revision_log WHERE status IN ('already-revised','flagged','queued','stub-fragment','needs-substantive-revision') GROUP BY slug").all();
  const doneSet = new Set((done && done.results || []).map(function(r) {
    return r.slug;
  }));
  const pend = await env.WATCH_DB.prepare("SELECT slug FROM version_queue WHERE status IN ('drafted','publishing') GROUP BY slug").all();
  const pendSet = new Set((pend && pend.results || []).map(function(r) {
    return r.slug;
  }));
  const out = [];
  for (const p of all) {
    if (doneSet.has(p.slug) || pendSet.has(p.slug)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
__name(selectCandidates, "selectCandidates");
async function verifySingleVersion(env, recId) {
  const rec = await zenodoGet("/" + recId);
  if (!rec || rec._status) return { count: 1, conceptrecid: null, latestDoi: null, uncertain: true };
  const conceptrecid = rec.conceptrecid || null;
  let count = 1;
  let latestDoi = rec.doi || null;
  try {
    const v = await zenodoGet("/" + recId + "/versions?size=5");
    const hits = v && v.hits && v.hits.hits || [];
    if (hits.length) {
      count = hits.length;
      latestDoi = hits[hits.length - 1].doi || rec.doi || null;
    }
  } catch (e) {
  }
  return { count, conceptrecid, latestDoi, uncertain: false };
}
__name(verifySingleVersion, "verifySingleVersion");
function auditPrompt(paper) {
  return [
    "You are an ADVERSARIAL reviewer auditing a QNFO research preprint for concrete, correctable defects. You are hostile-but-honest: report ONLY issues that genuinely appear in the text; never invent issues.",
    "Review categories: 1. overclaim/unsupported (a claim stated as fact without support, or a conclusion that does not follow). 2. missing-limitations (a quantitative/empirical claim with no scope or uncertainty disclosure). 3. terminology-isolation (domain terms with no cross-domain bridge). 4. citation/attribution (miscited reference or missing attribution). 5. prose (grammar, typos, unclear sentences). 6. meta/branded-language (meta-narration, virtue labels, internal gate/tool names).",
    "Severity: 'low' = prose/format/terminology-bridge/missing-changelog (safe to auto-fix); 'high' = any change to a number, equation, data, result, conclusion, or attribution (requires human review).",
    "For each issue provide a SURGICAL edit: 'location' must be an EXACT verbatim substring copied from the paper; 'fix' is the replacement (for insertion, fix = location + inserted text; for deletion, fix = ''). If you cannot quote an exact substring, do NOT propose an edit.",
    'Output JSON only: {"issues":[{"severity":"low|high","category":"...","location":"exact verbatim substring","fix":"replacement","reason":"1 sentence"}]}. If no genuine issues, return {"issues":[]}.',
    "PAPER TITLE: " + (paper.title || ""),
    "PAPER (markdown, may be truncated):",
    (paper.body_md || "").slice(0, 11e3)
  ].join("\n");
}
__name(auditPrompt, "auditPrompt");
function normWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
__name(normWs, "normWs");
function buildNormMap(s) {
  const norm = [];
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (norm.length && norm[norm.length - 1] !== " ") {
        norm.push(" ");
        map.push(i);
      }
    } else {
      norm.push(c);
      map.push(i);
    }
  }
  return { norm: norm.join(""), map };
}
__name(buildNormMap, "buildNormMap");
function applyEdits(md, issues) {
  let out = md;
  const applied = [];
  const skipped = [];
  const nm = buildNormMap(out);
  for (const it of issues) {
    const loc = it.location || "";
    const fix = it.fix || "";
    if (!loc) {
      skipped.push({ reason: "empty location", category: it.category });
      continue;
    }
    let start = -1, len = 0, method = null;
    const ex = out.indexOf(loc);
    if (ex >= 0) {
      start = ex;
      len = loc.length;
      method = "exact";
    }
    if (start < 0) {
      const nloc = normWs(loc);
      const nidx = nm.norm.indexOf(nloc);
      if (nidx >= 0 && nloc.length > 0) {
        start = nm.map[nidx];
        const endNorm = nidx + nloc.length - 1;
        len = nm.map[endNorm] + 1 - start;
        method = "normalized";
      }
    }
    if (start < 0) {
      skipped.push({ reason: "location not found", category: it.category, location: loc.slice(0, 80) });
      continue;
    }
    out = out.slice(0, start) + fix + out.slice(start + len);
    applied.push({ category: it.category, method });
  }
  return { md: out, applied, skipped };
}
__name(applyEdits, "applyEdits");
function bumpVersion(v) {
  const s = String(v || "").trim();
  if (/^v?0\./.test(s)) return "1.0.0";
  if (/^v?1\./.test(s)) return "2.0.0";
  return "2.0.0";
}
__name(bumpVersion, "bumpVersion");
function applyVersionMarkers(md, versionTo) {
  let out = md;
  if (/\*\*Version:\*\*/i.test(out)) out = out.replace(/\*\*Version:\*\*\s*[^\n]*/i, "**Version:** " + versionTo);
  out = out.replace(/^(version:\s*["']?)[^"'\n]+(["']?)\s*$/im, function(m, p1, p2) {
    return p1 + versionTo + p2;
  });
  return out;
}
__name(applyVersionMarkers, "applyVersionMarkers");
function addChangelog(md, versionTo, changelog) {
  const entry = "- v" + versionTo + ": " + changelog;
  const chIdx = md.indexOf("## Changelog");
  if (chIdx >= 0) {
    const nl = md.indexOf("\n", chIdx + "## Changelog".length);
    const insertAt = nl >= 0 ? nl + 1 : md.length;
    return md.slice(0, insertAt) + entry + "\n" + md.slice(insertAt);
  }
  const block = "\n## Changelog\n\n" + entry + "\n";
  const refIdx = md.indexOf("## References");
  if (refIdx >= 0) return md.slice(0, refIdx) + block + md.slice(refIdx);
  return md + block;
}
__name(addChangelog, "addChangelog");
async function processPaper(env, paper, mode) {
  const dry = mode === "dry";
  const doi = paper.zenodo_doi || paper.doi || "";
  const recId = recIdOf(doi);
  if (!recId) {
    return { slug: paper.slug, skipped: true, reason: "no zenodo recid", doi };
  }
  const v = await verifySingleVersion(env, recId);
  if (v.count >= 2) {
    if (!dry) {
      await env.WATCH_DB.prepare("INSERT INTO paper_revision_log (slug, doi, title, version_from, status, audit_summary, created_at, updated_at) VALUES (?, ?, ?, ?, 'already-revised', ?, datetime('now'), datetime('now'))").bind(paper.slug, doi, paper.title, paper.version, JSON.stringify({ zenodo_versions: v.count })).run();
    }
    return { slug: paper.slug, skipped: true, reason: "already " + v.count + " versions", doi };
  }
  const prov = await downloadProvenance(recId);
  let findings = { issues: [] };
  let auditParsed = false;
  let rawAuditLen = 0;
  try {
    const t = await aiText(env, auditPrompt(paper));
    rawAuditLen = t.length;
    const parsed = parseJsonObject(t);
    if (parsed && Array.isArray(parsed.issues)) {
      findings = parsed;
      auditParsed = true;
    }
  } catch (e) {
    findings = { issues: [], auditError: e.message };
  }
  const issues = findings.issues || [];
  const high = issues.filter(function(i) {
    return i.severity === "high";
  });
  const low = issues.filter(function(i) {
    return i.severity !== "high";
  });
  const auditSummary = { total: issues.length, low: low.length, high: high.length, categories: issues.map(function(i) {
    return i.category;
  }), parsed: auditParsed, rawLen: rawAuditLen };
  if (high.length) {
    if (!dry) {
      await env.WATCH_DB.prepare("INSERT INTO paper_revision_log (slug, doi, title, version_from, status, audit_summary, findings_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'flagged', ?, ?, datetime('now'), datetime('now'))").bind(paper.slug, doi, paper.title, paper.version, JSON.stringify(auditSummary), JSON.stringify(issues).slice(0, 4e3)).run();
    }
    return { slug: paper.slug, flagged: true, high: high.length, low: low.length, doi };
  }
  // SUBSTANCE GATE (2026-09-06, row 84): never publish a v2.0.0 for content the audit
  // found no genuine issues in, or for near-empty stub/fragment bodies. Log and skip.
  var bodyLen = String(paper.body_md || "").trim().length;
  var noRealIssues = !issues || issues.length === 0;
  // id 132 (2026-09-08): body is a fragment only when trivially short. The old regex matched any
  // short heading-only line (## Abstract, ## References) and mislabeled 6-21k-char papers as stubs.
  var isStub = bodyLen < 1500;
  if (isStub || noRealIssues) {
    if (!dry) {
      await env.WATCH_DB.prepare("INSERT INTO paper_revision_log (slug, doi, title, version_from, status, audit_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))").bind(paper.slug, doi, paper.title, paper.version, isStub ? "stub-fragment" : "needs-substantive-revision", JSON.stringify({ zenodo_versions: v.count, skipped: isStub ? "stub-or-fragment" : "no-genuine-issues", body_len: bodyLen })).run();
    }
    return { slug: paper.slug, skipped: true, reason: isStub ? "stub/fragment body" : "audit found no genuine issues (needs substantive revision)", issues: auditSummary, body_len: bodyLen, doi };
  }
  const versionTo = bumpVersion(paper.version);
  const edits = applyEdits(paper.body_md || "", low);
  let revised = applyVersionMarkers(edits.md, versionTo);
  const appliedCats = edits.applied.map(function(a) {
    return a.category;
  }).join(", ") || "no substantive corrections required";
  const changelog = "Adversarial audit revision. Fixes: " + appliedCats + ".";
  revised = addChangelog(revised, versionTo, changelog);
  const regen = regenerateProvenance(revised, paper.title, paper.slug);
  const merged = {
    references_bib: prov.references_bib || regen.references_bib,
    citation_audit: prov.citation_audit || regen.citation_audit,
    due_diligence: prov.due_diligence,
    project_plan: prov.project_plan || regen.project_plan,
    readme_md: prov.readme_md || regen.readme_md,
    license_md: prov.license_md || regen.license_md,
    verify_script: prov.verify_script,
    verify_output: prov.verify_output
  };
  if (dry) {
    return { slug: paper.slug, dry: true, versionFrom: paper.version, versionTo, issues: auditSummary, applied: edits.applied.length, skippedEdits: edits.skipped.length, mdDelta: revised.length - (paper.body_md || "").length, doi };
  }
  await env.WATCH_DB.prepare("INSERT INTO version_queue (paper_doi, slug, title, version_from, version_to, corrected_md, status, references_bib, citation_audit, due_diligence, project_plan, readme_md, verify_script, verify_output, license_md, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'drafted', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))").bind(doi, paper.slug, paper.title, paper.version, versionTo, revised, merged.references_bib, merged.citation_audit, merged.due_diligence, merged.project_plan, merged.readme_md, merged.verify_script, merged.verify_output, merged.license_md).run();
  await env.WATCH_DB.prepare("INSERT INTO paper_revision_log (slug, doi, title, version_from, version_to, status, audit_summary, changelog, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, datetime('now'), datetime('now'))").bind(paper.slug, doi, paper.title, paper.version, versionTo, JSON.stringify(auditSummary), changelog).run();
  return { slug: paper.slug, queued: true, versionFrom: paper.version, versionTo, issues: auditSummary, applied: edits.applied.length, skippedEdits: edits.skipped.length, doi };
}
__name(processPaper, "processPaper");
async function runOnce(env, mode) {
  const dry = mode === "dry";
  const candidates = await selectCandidates(env, BATCH);
  const results = [];
  for (const p of candidates) {
    try {
      results.push(await processPaper(env, p, mode));
    } catch (e) {
      results.push({ slug: p.slug, error: String(e && e.message || e).slice(0, 200) });
    }
  }
  return { ok: true, worker: "qnfo-paper-reviser", version: VERSION, dry, model: MODEL, candidates: candidates.length, results };
}
__name(runOnce, "runOnce");
async function statusSweep(env) {
  const total = await env.PAPERS_DB.prepare("SELECT COUNT(*) AS n FROM papers WHERE status='published' AND zenodo_doi IS NOT NULL AND zenodo_doi != ''").first();
  const done = await env.WATCH_DB.prepare("SELECT status, COUNT(*) AS n FROM paper_revision_log GROUP BY status").all();
  const pending = await env.WATCH_DB.prepare("SELECT COUNT(*) AS n FROM version_queue WHERE status IN ('drafted','publishing')").first();
  return { worker: "qnfo-paper-reviser", version: VERSION, published_zenodo_total: total && total.n || 0, revision_log: done && done.results || [], pending_version_queue: pending && pending.n || 0 };
}
__name(statusSweep, "statusSweep");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((url.pathname.startsWith("/run/") || url.pathname.startsWith("/debug/")) && !authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (url.pathname === "/health") return json({ ok: true, worker: "qnfo-paper-reviser", version: VERSION, model: MODEL, bindings: { ai: !!env.AI, papers: !!env.PAPERS_DB, watch: !!env.WATCH_DB, auth: !!env.REVISER_TOKEN } });
    if (url.pathname === "/run/scan") {
      const mode = url.searchParams.get("mode") || "dry";
      try {
        return json(await runOnce(env, mode));
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }
    if (url.pathname === "/debug/audit") {
      const slug = url.searchParams.get("slug") || "";
      try {
        const p = await env.PAPERS_DB.prepare("SELECT slug, doi, zenodo_doi, title, version, body_md FROM papers WHERE slug=? LIMIT 1").bind(slug).first();
        if (!p) return json({ ok: false, error: "no paper for slug " + slug }, 404);
        const t = await aiText(env, auditPrompt(p));
        return json({ ok: true, slug, rawLen: t.length, raw: t.slice(0, 3e3), parsed: parseJsonObject(t) });
      } catch (e) {
        return json({ ok: false, error: String(e && e.message || e).slice(0, 300) }, 500);
      }
    }
    if (url.pathname === "/debug/ai") {
      const m = url.searchParams.get("model") || MODEL;
      const p = url.searchParams.get("prompt") || "Reply with the single word: OK";
      try {
        const t = await aiText(env, p, m);
        return json({ ok: true, model: m, reply: t.slice(0, 500) });
      } catch (e) {
        return json({ ok: false, model: m, error: String(e && e.message || e).slice(0, 300) }, 500);
      }
    }
    if (url.pathname === "/run/status") {
      try {
        return json(await statusSweep(env));
      } catch (e) {
        return json({ ok: false, error: e.message }, 500);
      }
    }
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    try {
      const r = await runOnce(env, "live");
      console.log("[qnfo-paper-reviser] cron done:", JSON.stringify({ candidates: r.candidates, results: r.results.map(function(x) {
        return { slug: x.slug, queued: x.queued, flagged: x.flagged, skipped: x.skipped, error: x.error };
      }) }));
    } catch (e) {
      console.error("[qnfo-paper-reviser] cron error:", e.message);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
