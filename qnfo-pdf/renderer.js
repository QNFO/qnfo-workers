// renderer.js — Robust Markdown -> print-HTML renderer for QNFO scientific papers.
import katex from "katex";

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseFrontmatter(md) {
  const meta = {};
  let body = String(md == null ? "" : md).replace(/^\uFEFF/, "");
  const m = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (m) {
    body = body.slice(m[0].length);
    const lines = m[1].split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
      if (!kv) { i++; continue; }
      const key = kv[1], rest = kv[2];
      const isBlock = rest === "|" || rest === "|-" || rest === ">" || rest === ">-";
      if (isBlock || rest === "") {
        const vals = [];
        let j = i + 1;
        while (j < lines.length && (lines[j].trim() === "" || /^\s{1,}\S/.test(lines[j]))) {
          if (lines[j].trim() !== "") vals.push(lines[j].replace(/^\s{2,}/, "").replace(/^-\s+/, ""));
          j++;
        }
        i = j;
        const joined = vals.join("\n").trim();
        if (key === "keywords" || key === "tags" || key === "domains") {
          meta[key] = vals.map(function(v){ return v.trim(); }).filter(Boolean);
        } else {
          meta[key] = joined;
        }
        continue;
      }
      meta[key] = rest.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").trim();
      i++;
    }
  }
  return { meta: meta, body: body };
}

function extractSpecials(src) {
  const stash = [];
  let t = String(src == null ? "" : src);
  function push(kind, content) {
    stash.push({ kind: kind, content: content });
    return "\x00" + kind + (stash.length - 1) + "\x00";
  }
  t = t.replace(/\x60\x60\x60([^\n]*)\n([\s\S]*?)\x60\x60\x60/g, function(_, lang, code) {
    return push("C", { lang: lang.trim(), code: code.replace(/\n$/, "") });
  });
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, function(_, c) { return push("D", c.trim()); });
  t = t.replace(/\\\[([\s\S]*?)\\\]/g, function(_, c) { return push("D", c.trim()); });
  t = t.replace(/\$([^\$\n]+?)\$/g, function(_, c) { return push("I", c.trim()); });
  t = t.replace(/\\\(([\s\S]*?)\\\)/g, function(_, c) { return push("I", c.trim()); });
  return { text: t, stash: stash };
}

function safeKatex(tex, displayMode) {
  try {
    return katex.renderToString(tex, { displayMode: displayMode, throwOnError: false, strict: false, output: "html" });
  } catch (err) {
    return '<span class="katex-error">' + esc(tex) + "</span>";
  }
}

function restoreSpecials(text, stash) {
  return text.replace(/\x00([CDI])(\d+)\x00/g, function(_, kind, idx) {
    const e = stash[parseInt(idx, 10)];
    if (!e) return "";
    if (kind === "C") return "<pre" + (e.lang ? ' class="lang-' + esc(e.lang) + '"' : "") + "><code>" + esc(e.code) + "</code></pre>";
    if (kind === "D") return '<div class="math-display">' + safeKatex(e.content, true) + "</div>";
    return '<span class="math-inline">' + safeKatex(e.content, false) + "</span>";
  });
}

function isTableSep(line) {
  const cells = splitRow(line);
  if (!cells.length) return false;
  return cells.every(function(c) { return /^:?-{3,}:?$/.test(c.trim()); });
}
function splitRow(line) {
  let s = String(line).replace(/\r$/, "").trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells = [];
  let cur = "";
  for (let j = 0; j < s.length; j++) {
    const c = s[j];
    if (c === "\\" && j + 1 < s.length && s[j + 1] === "|") { cur += "|"; j++; }
    else if (c === "|") { cells.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}
function parseAlign(sepLine) {
  return splitRow(sepLine).map(function(c) {
    const l = c.startsWith(":"), r = c.endsWith(":");
    return (l && r) ? "center" : (r ? "right" : "left");
  });
}

function renderInlinePlain(t) {
  let s = String(t == null ? "" : t);
  const escTokens = [];
  s = s.replace(/\\\\([\\\x60*_{}\[\]()#+.\-!|>~])/g, function(m, ch) {
    escTokens.push(ch);
    return "\x00E" + (escTokens.length - 1) + "\x00";
  });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function(_, alt, url) {
    return '<img src="' + esc(url) + '" alt="' + esc(alt) + '">';
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function(_, text, url) {
    return '<a href="' + esc(url) + '">' + text + "</a>";
  });
  s = s.replace(/\x60([^\x60\n]+)\x60/g, function(_, code) { return "<code>" + esc(code) + "</code>"; });
  s = s.replace(/\[\s*@([^\]]+?)\s*\]/g, function(_, keys) {
    const ks = keys.split(/[;,\s]+/).map(function(k) { return k.replace(/^@/, ""); }).filter(Boolean);
    return '<span class="cite">[' + esc(ks.join(", ")) + "]</span>";
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\x00E(\d+)\x00/g, function(_, i) { return esc(escTokens[parseInt(i, 10)] || ""); });
  return s;
}

function renderInline(raw) {
  const e = extractSpecials(raw);
  return restoreSpecials(renderInlinePlain(e.text), e.stash);
}

function renderMarkdown(body) {
  const e = extractSpecials(body);
  const lines = e.text.split("\n");
  let o = "", i = 0;
  while (i < lines.length) {
    const line = lines[i], t = line.trim();
    if (!t) { i++; continue; }
    if (/^\x00[CD]\d+\x00$/.test(t)) { o += t; i++; continue; }
    if (t.indexOf("|") >= 0) {
      let si = i + 1;
      while (si < lines.length && !lines[si].trim()) si++;
      if (si < lines.length && isTableSep(lines[si])) {
        const header = splitRow(line);
        const aligns = parseAlign(lines[si]);
        const rows = [];
        let j = si + 1;
        while (j < lines.length) {
          if (!lines[j].trim()) { j++; continue; }
          if (lines[j].trim().indexOf("|") < 0) break;
          rows.push(splitRow(lines[j]));
          j++;
        }
        i = j;
        const ncol = Math.max(header.length, aligns.length, rows.length ? Math.max.apply(null, rows.map(function(r){ return r.length; })) : 0);
        o += "<table><thead><tr>";
        for (let c = 0; c < ncol; c++) {
          const al = aligns[c] || "left";
          o += '<th style="text-align:' + al + '">' + renderInlinePlain(header[c] || "") + "</th>";
        }
        o += "</tr></thead><tbody>";
        for (const row of rows) {
          o += "<tr>";
          for (let c = 0; c < ncol; c++) {
            const al = aligns[c] || "left";
            o += '<td style="text-align:' + al + '">' + renderInlinePlain(row[c] || "") + "</td>";
          }
          o += "</tr>";
        }
        o += "</tbody></table>";
        continue;
      }
    }
    const hm = t.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      o += "<h" + hm[1].length + ">" + renderInlinePlain(hm[2]) + "</h" + hm[1].length + ">";
      i++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { o += "<hr>"; i++; continue; }
    if (t.charAt(0) === ">") {
      o += "<blockquote>";
      while (i < lines.length && lines[i].trim().charAt(0) === ">") {
        o += "<p>" + renderInlinePlain(lines[i].trim().replace(/^>\s?/, "")) + "</p>";
        i++;
      }
      o += "</blockquote>";
      continue;
    }
    if (/^[-*+]\s+/.test(t)) {
      o += "<ul>";
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        o += "<li>" + renderInlinePlain(lines[i].trim().replace(/^[-*+]\s+/, "")) + "</li>";
        i++;
      }
      o += "</ul>";
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      o += "<ol>";
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        o += "<li>" + renderInlinePlain(lines[i].trim().replace(/^\d+\.\s+/, "")) + "</li>";
        i++;
      }
      o += "</ol>";
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim()) {
      const lt = lines[i].trim();
      if (/^(#{1,6}\s|>|[-*+]\s|\d+\.\s)/.test(lt)) break;
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(lt)) break;
      if (lt.indexOf("|") >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
      buf.push(lt);
      i++;
    }
    if (buf.length) o += "<p>" + buf.map(renderInlinePlain).join(" ") + "</p>";
  }
  return restoreSpecials(o, e.stash);
}

function renderPaperHTML(md, opts) {
  opts = opts || {};
  const pm = parseFrontmatter(md);
  const meta = pm.meta;
  const title = meta.title || opts.title || "Untitled";
  const author = meta.author || opts.author || "";
  const orcid = meta.ORCID || meta.orcid || opts.orcid || "";
  const affiliation = meta.affiliation || opts.affiliation || "";
  const date = meta.date || opts.date || "";
  const version = meta.version || opts.version || "";
  const doi = meta.doi || meta.DOI || opts.doi || "";
  const abstract = meta.abstract || opts.abstract || "";
  const keywords = Array.isArray(meta.keywords) ? meta.keywords : (meta.keywords ? [meta.keywords] : []);
  const license = meta.license || opts.license || "";
  const bodyHtml = renderMarkdown(pm.body);
  const metaLine = [affiliation, date, version ? ("v" + version) : "", doi ? ("DOI: " + doi) : ""].filter(Boolean).join(" \u00b7 ");
  const front =
    '<header class="fm">' +
    "<h1>" + esc(title) + "</h1>" +
    (author ? '<div class="fm-author">' + esc(author) + (orcid ? ' <a class="orcid" href="https://orcid.org/' + esc(orcid) + '">ORCID ' + esc(orcid) + "</a>" : "") + "</div>" : "") +
    (metaLine ? '<div class="fm-meta">' + esc(metaLine) + "</div>" : "") +
    (abstract ? '<div class="fm-abstract"><strong>Abstract.</strong> ' + renderInline(abstract) + "</div>" : "") +
    (keywords.length ? '<div class="fm-keywords"><strong>Keywords.</strong> ' + esc(keywords.join(", ")) + "</div>" : "") +
    "</header>";
  return { title: title, author: author, date: date, version: version, doi: doi, license: license, bodyHtml: bodyHtml, front: front, abstract: abstract, keywords: keywords };
}

const PRINT_CSS = [
  "@page { size: A4; }",
  "html,body { margin:0; padding:0; }",
  "body { font-family:'STIX Two Text',Cambria,Georgia,'Times New Roman',serif; font-size:10.5pt; line-height:1.55; color:#111; text-align:justify; hyphens:auto; -webkit-hyphens:auto; overflow-wrap:break-word; }",
  ".fm { margin:0 0 16pt 0; }",
  ".fm h1 { font-size:17pt; font-weight:700; line-height:1.25; margin:0 0 6pt 0; text-align:left; hyphens:none; }",
  ".fm-author { font-size:11.5pt; margin:0 0 2pt 0; }",
  ".fm-author .orcid { font-size:8.5pt; color:#24315e; text-decoration:none; margin-left:5pt; }",
  ".fm-meta { font-size:9pt; color:#444; margin:0 0 8pt 0; }",
  ".fm-abstract { font-size:9.5pt; margin:8pt 0; padding:8pt 11pt; background:#f7f6f2; border-left:2pt solid #24315e; }",
  ".fm-keywords { font-size:9pt; color:#333; margin:0 0 4pt 0; }",
  "h1 { font-size:14pt; margin:16pt 0 6pt 0; }",
  "h2 { font-size:12.5pt; margin:14pt 0 6pt 0; border-bottom:0.6pt solid #bbb; padding-bottom:3pt; }",
  "h3 { font-size:11pt; margin:12pt 0 5pt 0; }",
  "h4 { font-size:10.5pt; font-style:italic; margin:10pt 0 4pt 0; }",
  "h1,h2,h3,h4 { page-break-after:avoid; }",
  "p { margin:0 0 6pt 0; orphans:3; widows:3; }",
  "ul,ol { margin:0 0 6pt 0; padding-left:20pt; }",
  "li { margin:0 0 2pt 0; }",
  "blockquote { margin:8pt 0; padding:4pt 12pt; border-left:2pt solid #999; color:#333; }",
  "hr { border:none; border-top:0.6pt solid #999; margin:12pt 0; }",
  "table { width:100%; border-collapse:collapse; margin:8pt 0 10pt 0; font-size:8.8pt; line-height:1.4; }",
  "thead { display:table-header-group; }",
  "th { font-weight:700; text-align:left; border-top:1.2pt solid #000; border-bottom:0.6pt solid #000; padding:3pt 5pt; }",
  "td { border-bottom:0.4pt solid #ccc; padding:2.5pt 5pt; vertical-align:top; }",
  "tbody tr:last-child td { border-bottom:1.2pt solid #000; }",
  "tr { page-break-inside:avoid; }",
  ".math-display { text-align:center; margin:10pt 0; page-break-inside:avoid; }",
  ".math-inline { white-space:nowrap; }",
  "mjx-container[display='true'] { margin:4pt 0 !important; }",
  "pre { font-family:Consolas,'Courier New',monospace; font-size:8pt; line-height:1.4; background:#f5f5f3; border:0.5pt solid #ddd; padding:6pt 8pt; margin:8pt 0; white-space:pre-wrap; word-wrap:break-word; }",
  "code { font-family:Consolas,'Courier New',monospace; font-size:0.88em; }",
  ".cite { color:#24315e; font-size:0.9em; }",
  "a { color:#24315e; text-decoration:none; }"
].join("\n");

function renderFullHTML(md, opts) {
  const r = renderPaperHTML(md, opts);
  return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><title>" + esc(r.title) + "</title>" +
    "<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css\">" +
    "<style>" + PRINT_CSS + "</style></head><body>" + r.front + r.bodyHtml + "</body></html>";
}

export { esc, parseFrontmatter, renderMarkdown, renderInline, renderPaperHTML, renderFullHTML, PRINT_CSS };
