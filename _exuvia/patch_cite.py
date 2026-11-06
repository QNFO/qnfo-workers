import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()

# version: new routes are a minor capability
old_v = 'var VERSION="3.44.2-frame-policy";'
assert s.startswith(old_v)
s = s.replace(old_v, 'var VERSION="3.45.0-cite-exports"; // 3.45.0 PAPER-PIDS-1 slice (2026-10-28, pillar research): per-paper CITATION.cff, CSL-JSON and BibTeX at /api/papers/<slug>.cff|.csl.json|.bib, built from the same open record as the JSON API and OAI-PMH (BP26-PAPER-PIDS-1, agent_issues 1000338).', 1)

funcs = r'''
// PAPER-PIDS-1 (3.45.0): reference-manager exports of one paper, from the open record (no new data path). CFF 1.2.0 needs SPDX licences, so the
// licence line is written only when the record has one.
function citeNameParts(n) {
  const t = String(n || "").trim();
  const i = t.lastIndexOf(" ");
  return i > 0 ? { given: t.slice(0, i), family: t.slice(i + 1) } : { given: "", family: t };
}
function citeYaml(v) { return JSON.stringify(String(v == null ? "" : v)); }
function citeCff(r) {
  const out = ["cff-version: 1.2.0", "message: " + citeYaml("If you use this paper, please cite it as below."), "type: article", "title: " + citeYaml(r.title), "authors:"];
  for (const a of r.authors) {
    const n = citeNameParts(a);
    out.push("  - family-names: " + citeYaml(n.family));
    if (n.given) out.push("    given-names: " + citeYaml(n.given));
    if (String(a).indexOf("Quni-Gudzinas") >= 0) out.push("    orcid: " + citeYaml("https://orcid.org/" + OWNER_ORCID));
  }
  if (r.version) out.push("version: " + citeYaml(r.version));
  if (r.date) out.push("date-released: " + citeYaml(r.date));
  out.push("url: " + citeYaml(r.url));
  if (r.doi) out.push("doi: " + citeYaml(r.doi));
  if (r.abstract) out.push("abstract: " + citeYaml(r.abstract.slice(0, 3000)));
  if (r.keywords && r.keywords.length) { out.push("keywords:"); for (const k of r.keywords) out.push("  - " + citeYaml(k)); }
  if (r.license_spdx) out.push("license: " + citeYaml(r.license_spdx));
  return out.join("\n") + "\n";
}
function citeCsl(r) {
  const d = String(r.date || "").split("-").map((x) => parseInt(x, 10)).filter((x) => Number.isFinite(x));
  const item = { id: r.slug, type: "article", title: r.title, author: r.authors.map((a) => { const n = citeNameParts(a); return n.given ? { family: n.family, given: n.given } : { literal: n.family }; }), publisher: "QNFO", URL: r.url };
  if (d.length) item.issued = { "date-parts": [d] };
  if (r.doi) item.DOI = r.doi;
  if (r.abstract) item.abstract = r.abstract.slice(0, 3000);
  if (r.version) item.version = r.version;
  if (r.language) item.language = r.language;
  if (r.keywords && r.keywords.length) item.keyword = r.keywords.join(", ");
  return JSON.stringify([item], null, 2) + "\n";
}
function citeBib(r) {
  const esc = (v) => String(v == null ? "" : v).replace(/[{}\\]/g, " ").replace(/[\r\n]+/g, " ").replace(/([&%$#_])/g, "\\$1").trim();
  const key = "qnfo_" + String(r.slug).replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
  const f = [["author", r.authors.map(esc).join(" and ")], ["title", "{" + esc(r.title) + "}"], ["year", String(r.date || "").slice(0, 4)], ["publisher", "QNFO"], ["url", r.url]];
  if (r.doi) f.push(["doi", r.doi]);
  if (r.version) f.push(["note", "Version " + esc(r.version)]);
  return "@article{" + key + ",\n" + f.filter((x) => x[1]).map((x) => "  " + x[0] + " = {" + x[1] + "}").join(",\n") + "\n}\n";
}
function citeResponse(r, fmt) {
  const types = { cff: ["text/yaml; charset=utf-8", citeCff, "CITATION.cff"], "csl.json": ["application/vnd.citationstyles.csl+json; charset=utf-8", citeCsl, r.slug + ".csl.json"], bib: ["application/x-bibtex; charset=utf-8", citeBib, r.slug + ".bib"] };
  const t = types[fmt];
  return new Response(t[1](r), { status: 200, headers: { "Content-Type": t[0], "Content-Disposition": 'inline; filename="' + t[2] + '"', "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300" } });
}
'''
anchor = "async function handleOpenData(request, env, p) {"
assert s.count(anchor) == 1
s = s.replace(anchor, funcs.lstrip("\n") + anchor, 1)

old = '''      const slug = decodeURIComponent(p.slice(12));
      const row = await env.LIVING_PAPER.prepare("SELECT " + OPEN_COLS + " FROM papers WHERE " + OPEN_WHERE + " AND slug = ?").bind(slug).first();
      if (!row) return openJson({ error: "not found" }, 404);
      const r = openRecord(row);
      return openJson('''
assert s.count(old) == 1
new = '''      let slug = decodeURIComponent(p.slice(12));
      const cite = /\\.(cff|bib|csl\\.json)$/.exec(slug);
      if (cite) slug = slug.slice(0, -cite[0].length);
      const row = await env.LIVING_PAPER.prepare("SELECT " + OPEN_COLS + " FROM papers WHERE " + OPEN_WHERE + " AND slug = ?").bind(slug).first();
      if (!row) return openJson({ error: "not found" }, 404);
      const r = openRecord(row);
      if (cite) return citeResponse(r, cite[1]);
      return openJson('''
s = s.replace(old, new, 1)
open(p, "w", encoding="utf-8", newline="").write(s)
print("patched")
