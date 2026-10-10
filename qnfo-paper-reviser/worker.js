var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.3.0-ground"; // 1.3.0 REVISER-GROUND-1 (owner directive 2026-10-10): a low-severity edit must add no assertion (surface category, short, every name/figure/year/link and nearly every content word already in the paper); anything else is high and flagged, so bridge sentences are never auto-applied from memory; the audit prompt says so. // 1.2.7 REVISER-FLAGGED-DEADEND-1 (#1812): high findings become internal_errata rows (unconfirmed until a second model confirms); 1.2.6 LICENSE-ONE-1 (#517): new deposits under QNFO-ULA v2.0; 1.2.5 CHANGELOG-ANCHOR-1 (2026-10-02): changelog block anchored to a References heading at line start (no bare "#" line). 1.2.4: FIX-REVISER-GARBAGE (2026-09-14): reject reasoning/outline output before queue
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
  const readme = "# " + title + "\n\nAuthor: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)\nLicense: QNFO-ULA v2.0, CC BY-NC-SA 4.0 with the QNFO Supplemental Terms (see LICENSE)\n\nHow to cite: use the deposit record DOI.\nFiles in this deposit:\n- " + slug + ".md - full paper (source)\n- references.bib - BibTeX of the cited references\n- citation-audit.md - reference verification log\n- PROJECT-PLAN.md - goal and claim\n- README.md - this file\n- LICENSE - QNFO-ULA v2.0\n\nProvenance: produced by the QNFO autonomous research pipeline.\n";
  const plan = "# Project plan\n\nGoal: an open, self-contained preprint with real, verifiable references and no fabricated content.\n- Claim: stated in the record body.\n- Research/due-diligence: prior-work context is stated in the body; every reference is real (arXiv ID or DOI) and non-invented.\n- Deposit: paper, references.bib, citation-audit.md, README.md, PROJECT-PLAN.md, LICENSE.\n- License: QNFO-ULA v2.0 (CC BY-NC-SA 4.0 base).\n";
  const lic = "SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.0\n\nThis work is licensed under the QNFO Unified License Agreement, version 2.0 (QNFO-ULA): the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0) together with the QNFO Supplemental Terms.\nYou may share and adapt it for non-commercial purposes with credit, under the same terms. Commercial use needs a separate agreement: rowan.quni@qnfo.org.\n\nFull text: https://legal.qnfo.org/\nCC BY-NC-SA 4.0 legal code: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode\n"; // LICENSE-ONE-1 (2026-10-02): new deposits under QNFO-ULA v2.0
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
    if (String(p.body_md || "").length < 8000) {
      await env.WATCH_DB.prepare("INSERT INTO paper_revision_log (slug, doi, title, status, audit_summary, created_at, updated_at) VALUES (?, ?, ?, 'stub-fragment', 'auto-skip: body < 8000 chars; defers to substantive-remediation loop', datetime('now'), datetime('now'))").bind(p.slug, p.doi, p.title).run();
      continue;
    }
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
// ACCURACY-GROUND-1 (owner directive 2026-10-10: published or sent text is 100% accurate; every claim verifiable against supplied
// source text): deterministic check that the figures, years, links and capitalised names in generated text occur in the source
// text the model was given. Returns problem strings; an empty list means every one was found. Same method as
// q08-signal-engine groundingProblems (Q08-VERIFY-1). A model's own recollection is never a source.
var GROUND_ALLOW = ["dr", "prof", "mr", "ms", "mrs", "qnfo", "zenodo", "doi", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
function groundWordSet(text) {
  var set = {};
  String(text || "").toLowerCase().replace(/[‘’]/g, "'").replace(/[a-z0-9][a-z0-9'.-]*/g, function (w) {
    w = w.replace(/[.'-]+$/, ""); set[w] = 1; set[w.replace(/'s$/, "")] = 1; return "";
  });
  return set;
}
function ungroundedTerms(text, source, allow) {
  var out = [], seen = {}, words = groundWordSet(source), nums = {};
  var ok = {}; GROUND_ALLOW.concat(allow || []).forEach(function (a) { ok[String(a).toLowerCase()] = 1; });
  (String(source || "").match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function (n) { nums[n.replace(/,/g, "").replace(/\.0+$/, "")] = 1; });
  function add(kind, v) { var k = kind + v.toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(kind + ": " + v); } }
  var body = String(text || "");
  (body.match(/\d[\d,]*(?:\.\d+)?/g) || []).forEach(function (n) {
    var c = n.replace(/,/g, "").replace(/\.0+$/, "");
    if (!nums[c]) add("figure or year not in the source", n);
  });
  (body.match(/https?:\/\/[^\s)\]>"']+|\b10\.\d{4,9}\/[^\s)\]>"']+|\barxiv:\s*\d{4}\.\d{4,5}/gi) || []).forEach(function (u) {
    var core = u.replace(/[.,;:]+$/, "").toLowerCase();
    if (String(source || "").toLowerCase().indexOf(core) < 0) add("link or identifier not in the source", u);
  });
  body.split(/(?<=[.!?:;])\s+|\n+/).forEach(function (sent) {
    var toks = sent.match(/[A-Za-z0-9][A-Za-z0-9&'.’-]*/g) || [];
    for (var i = 1; i < toks.length; i++) {
      var t = toks[i].replace(/’/g, "'").replace(/[.'-]+$/, "");
      if (!/^[A-Z]/.test(t) || /^[A-Z]$/.test(t)) continue;
      var low = t.toLowerCase().replace(/'s$/, "");
      if (ok[low] || words[low] || words[t.toLowerCase()]) continue;
      add("name not in the source", t);
    }
  });
  return out.slice(0, 14);
}
// REVISER-GROUND-1 (owner directive 2026-10-10): the auditor's "low" label is a claim, not a fact. An edit is auto-applied
// only when it adds no assertion: its category is a surface category, its replacement is short, and every name, figure, year,
// link and all but a couple of its content words already occur in the paper. Anything else (a bridge sentence, a new
// comparison, a definition, an attribution) is treated as high severity, so it is flagged for a second model and never
// written into a paper from the auditor's memory.
var LOW_SAFE_CATEGORY_RE = /^(?:\d+\.?\s*)?(prose|format|formatting|typo|grammar|spelling|punctuation|meta|branded|changelog|missing-changelog)/i;
function contentWordSet(text) {
  var set = {};
  String(text || "").toLowerCase().replace(/[a-z][a-z'-]{3,}/g, function (w) { set[w] = 1; return ""; });
  return set;
}
function lowEditProblem(it, body) {
  var cat = String(it && it.category || "").trim();
  if (!LOW_SAFE_CATEGORY_RE.test(cat)) return "category '" + cat.slice(0, 40) + "' can assert content";
  var loc = String(it && it.location || ""), fix = String(it && it.fix || "");
  var delta = fix.indexOf(loc) >= 0 && loc ? fix.replace(loc, " ") : fix;
  if (delta.length > 240) return "replacement adds " + delta.length + " characters";
  var probs = ungroundedTerms(delta, body);
  if (probs.length) return probs[0];
  var known = contentWordSet(body + " " + loc), fresh = 0;
  String(delta).toLowerCase().replace(/[a-z][a-z'-]{3,}/g, function (w) { if (!known[w]) fresh++; return ""; });
  if (fresh > 2) return fresh + " content words are not in the paper";
  return "";
}
function guardSeverity(issues, body) {
  return (issues || []).map(function (it) {
    if (!it || it.severity === "high") return it;
    var why = lowEditProblem(it, body);
    return why ? Object.assign({}, it, { severity: "high", demoted: "REVISER-GROUND-1: " + why }) : it;
  });
}
function auditPrompt(paper) {
  return [
    "You are an ADVERSARIAL reviewer auditing a QNFO research preprint for concrete, correctable defects. You are hostile-but-honest: report ONLY issues that genuinely appear in the text; never invent issues.",
    "Review categories: 1. overclaim/unsupported (a claim stated as fact without support, or a conclusion that does not follow). 2. missing-limitations (a quantitative/empirical claim with no scope or uncertainty disclosure). 3. terminology-isolation (a term used without a definition anywhere in the paper). 4. citation/attribution (miscited reference or missing attribution). 5. prose (grammar, typos, unclear sentences). 6. meta/branded-language (meta-narration, virtue labels, internal gate/tool names). 7. literature-coverage (no engagement with prior/related work, or statements about the literature with no citations). 8. quantitative-justification (a quantitative or empirical claim with no computation, simulation, derivation, or citation support). 9. computational-verification (results presented without a reproducible computation artifact: code block, table, or explicit derivation).",
    "Severity: 'low' = spelling, grammar, formatting or changelog edits only, whose replacement adds no assertion and uses words already in the paper (safe to auto-fix); 'high' = any change to a number, equation, data, result, conclusion, or attribution, ANY inserted or rewritten sentence that asserts a fact, relationship, comparison, definition or bridge between terms or fields, OR a literature-coverage / quantitative-justification / computational-verification gap (these require a full revision cycle, never a surgical edit). Every name, number, year and claim in a 'fix' must be quoted from, or directly derivable from, the paper text; you never add content from memory, and when no paper text supports a fix, report the issue as high with fix = ''.",
    "For each issue provide a SURGICAL edit: 'location' must be an EXACT verbatim substring copied from the paper; 'fix' is the replacement (for insertion, fix = location + inserted text; for deletion, fix = ''). If you cannot quote an exact substring, do NOT propose an edit.",
    "'confidence' is your probability (0 to 1) that the issue is real and would survive a second independent reviewer.",
    'Output JSON only: {"issues":[{"severity":"low|high","category":"...","location":"exact verbatim substring","fix":"replacement","reason":"1 sentence","confidence":0.0}]}. If no genuine issues, return {"issues":[]}.',
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
  const chM = /^#{1,6}[ \t]+Changelog[ \t]*$/m.exec(md);
  const chIdx = chM ? chM.index : -1;
  if (chIdx >= 0) {
    const nl = md.indexOf("\n", chIdx + chM[0].length);
    let insertAt = nl >= 0 ? nl + 1 : md.length;
    if (md.charAt(insertAt) === "\n") insertAt++;
    return md.slice(0, insertAt) + entry + "\n" + md.slice(insertAt);
  }
  const block = "\n## Changelog\n\n" + entry + "\n\n";
  // CHANGELOG-ANCHOR-1 (1.2.5): the References heading is matched at the start of a line. indexOf("## References")
  // also hit "### References", so the block landed after its first "#" and published a bare "#" line (4 papers).
  const refM = /^#{1,6}[ \t]+(?:\d+\.?\s*)?(?:references|bibliography)\b/im.exec(md);
  if (refM) return md.slice(0, refM.index) + block + md.slice(refM.index);
  return md + block;
}
__name(addChangelog, "addChangelog");
// REVISER-FLAGGED-DEADEND-1 (#1812): a HIGH finding on a published paper becomes an internal_errata row plus an
// errata_queue row in status 'internal-open', the same two rows errata-hub's POST /internal-errata writes. Both workers
// bind the same qnfo-audit D1, so this needs no copy of errata-hub's ERRATA_TOKEN. internal-open items are never
// auto-answered or auto-published by errata-hub, and idea-hub's public gate reads only target_kind 'chat_log', so a
// single-model finding reaches no reader: a second model must confirm it first. The row id is derived from the paper and
// the finding, so a rescan of the same paper adds nothing (INSERT OR IGNORE), and the queue row is written only for a
// new erratum.
var ERRATA_MAX_PER_PAPER = 8;
function findingHash(s) {
  let h = 2166136261;
  const t = String(s || "");
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
__name(findingHash, "findingHash");
function clampConfidence(c) {
  const n = Number(c);
  if (!isFinite(n)) return null;
  return Math.max(0, Math.min(1, n > 1 && n <= 100 ? n / 100 : n));
}
__name(clampConfidence, "clampConfidence");
async function recordFlaggedErrata(env, paper, doi, high, meta) {
  meta = meta || {};
  const ref = doi || paper.slug;
  const key = (recIdOf(doi) || String(paper.slug || "")).slice(0, 40);
  const now = new Date().toISOString();
  const ids = [];
  let recorded = 0;
  for (const f of (high || []).slice(0, ERRATA_MAX_PER_PAPER)) {
    const reason = String(f && f.reason || "").trim();
    const location = String(f && f.location || "").trim();
    const category = String(f && f.category || "unspecified").trim().slice(0, 64);
    if (!reason && !location) continue;
    const confidence = clampConfidence(f && f.confidence);
    const id = "rev-" + key + "-" + findingHash(category + "|" + location + "|" + reason);
    const claim = ("[" + category + "] " + (reason || "high-severity finding") + (location ? ' At: "' + location.slice(0, 600) + '"' : "")).slice(0, 4e3);
    const evidence = JSON.stringify({ source: "qnfo-paper-reviser", version: VERSION, model: MODEL, confidence, run_id: meta.runId || null, log_id: meta.logId == null ? null : meta.logId, slug: paper.slug, doi: doi || null, paper_version: paper.version || null, category, location: location.slice(0, 1500), proposed_fix: String(f && f.fix || "").slice(0, 1500) });
    const remediation = "Unconfirmed single-model finding (REVISER-FLAGGED-DEADEND-1): a second model must confirm it before any reader-facing notice or correction. Proposed fix: " + String(f && f.fix || "(none given)").slice(0, 1200);
    const r = await env.WATCH_DB.prepare("INSERT OR IGNORE INTO internal_errata (id, target_kind, target_ref, detected_at, detected_by, severity, claim_text, falsification, evidence, remediation, status, owner, updated_at) VALUES (?1, 'paper', ?2, ?3, ?4, 'high', ?5, NULL, ?6, ?7, 'open', 'errata-hub', ?3)").bind(id, ref, now, "qnfo-paper-reviser/" + VERSION, claim, evidence, remediation).run();
    const fresh = r && r.meta ? Number(r.meta.changes || 0) > 0 : false;
    if (fresh) {
      await env.WATCH_DB.prepare("INSERT INTO errata_queue (email_id, source, sender, subject, paper_doi, claim, confidence, status) VALUES (NULL, 'internal_audit', 'qnfo-paper-reviser', ?1, ?2, ?3, ?4, 'internal-open')").bind(id, doi || null, claim, confidence).run();
      recorded++;
    }
    ids.push(id);
  }
  return { recorded, ids };
}
__name(recordFlaggedErrata, "recordFlaggedErrata");
async function processPaper(env, paper, mode, runId) {
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
  const issues = guardSeverity(findings.issues || [], paper.body_md || "");
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
    let errata = null;
    if (!dry) {
      const lr = await env.WATCH_DB.prepare("INSERT INTO paper_revision_log (slug, doi, title, version_from, status, audit_summary, findings_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'flagged', ?, ?, datetime('now'), datetime('now'))").bind(paper.slug, doi, paper.title, paper.version, JSON.stringify(auditSummary), JSON.stringify(issues).slice(0, 4e3)).run();
      // REVISER-FLAGGED-DEADEND-1 (#1812): 'flagged' is terminal for this loop and nothing else read it, so every HIGH
      // finding is also recorded as an internal erratum for errata-hub (fail-soft: the scan never fails on this).
      try {
        errata = await recordFlaggedErrata(env, paper, doi, high, { runId, logId: lr && lr.meta ? lr.meta.last_row_id : null });
      } catch (eE) {
        errata = { recorded: 0, error: String(eE && eE.message || eE).slice(0, 200) };
      }
    }
    return { slug: paper.slug, flagged: true, high: high.length, low: low.length, doi, errata };
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
  // REVISED-TDZ-1 (2026-10-01): the garbage check below read `revised` before its declaration (ReferenceError on
  // every paper that reached it), so nothing was ever queued. The revision is now computed first.
  const versionTo = bumpVersion(paper.version);
  const edits = applyEdits(paper.body_md || "", low);
  let revised = applyVersionMarkers(edits.md, versionTo);
  // FIX-REVISER-GARBAGE (2026-09-14): reject non-paper AI output (reasoning preamble / outline fragment).
  // Root cause of the 20-row gate-blocked backlog: for long essay inputs the auditor's surgical
  // edits produced reasoning text / outline fragments that were queued as corrected_md.
  var _rv = String(revised || "");
  var _head = _rv.slice(0, 180).trim().toLowerCase();
  var _hasHeading = _rv.indexOf("# ") === 0 || _rv.indexOf("\n# ") >= 0 || _rv.indexOf("\n## ") >= 0;
  var _badHead = _head.indexOf("**") === 0 || _head.indexOf("complexity assessment") >= 0 || _head.indexOf("here is") === 0 || _head.indexOf("here\u2019s") === 0 || _head.indexOf("the provided topic") === 0 || _head.indexOf("let me") === 0;
  var _outline = _head.indexOf("merged outline") >= 0 || _head.indexOf("continuation of") >= 0 || _head.indexOf("chapter 3:") === 0 || _head.indexOf("chapter 5:") === 0;
  var _hasBody = _rv.length >= 1500;
  if (!_hasBody || _badHead || _outline || !_hasHeading) {
    var _reason = _badHead ? "reasoning-preamble" : _outline ? "outline-fragment" : !_hasHeading ? "no-h1" : "too-short";
    if (!dry) {
      try {
        await env.WATCH_DB.prepare("INSERT INTO paper_revision_log (slug, doi, title, version_from, status, audit_summary, error, created_at, updated_at) VALUES (?, ?, ?, ?, 'needs-substantive-revision', ?, ?, datetime('now'), datetime('now'))").bind(paper.slug, doi, paper.title, paper.version, JSON.stringify(auditSummary), "AI revision rejected: " + _reason).run();
      } catch (eRj) {}
    }
    return { slug: paper.slug, rejected: true, reason: _reason, issues: auditSummary, doi: doi };
  }
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
  const runId = "rv-" + Date.now().toString(36);
  for (const p of candidates) {
    try {
      results.push(await processPaper(env, p, mode, runId));
    } catch (e) {
      results.push({ slug: p.slug, error: String(e && e.message || e).slice(0, 200) });
    }
  }
  return { ok: true, worker: "qnfo-paper-reviser", version: VERSION, dry, model: MODEL, run_id: runId, candidates: candidates.length, results };
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
    if (url.pathname === "/health") return json({ ok: true, worker: "qnfo-paper-reviser", version: VERSION, model: MODEL, capabilities: ["paper-revision-scan", "revision-audit", "version-queue", "flagged-to-internal-errata"], limitations: ["/run/* and /debug/* require X-Reviser-Token", "/run/scan defaults to a dry run", "scheduled scans run every 4 hours (37 */4)", "one model per run: " + MODEL, "a HIGH finding is recorded as an unconfirmed internal erratum (internal-open, never shown to readers) until a second model confirms it (REVISER-FLAGGED-DEADEND-1)"], bindings: { ai: !!env.AI, papers: !!env.PAPERS_DB, watch: !!env.WATCH_DB, auth: !!env.REVISER_TOKEN } });
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
        return { slug: x.slug, queued: x.queued, flagged: x.flagged, errata: x.errata ? x.errata.recorded : void 0, skipped: x.skipped, error: x.error };
      }) }));
    } catch (e) {
      console.error("[qnfo-paper-reviser] cron error:", e.message);
    }
  }
};
export {
  worker_default as default,
  recordFlaggedErrata
};
//# sourceMappingURL=worker.js.map