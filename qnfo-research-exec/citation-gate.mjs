// CITATION-EXISTENCE-GATE-1 (agent_issues 2052, pillar research): every arXiv id, DOI and link a paper cites must resolve,
// and a cited title must match the id it is attached to, before the paper is released.
//
// WHY    On 2026-10-04 a draft carried arXiv 2606.31097, an id that does not exist, attached to two real authors, and a
//        second id whose page had nothing to do with the claim it supported. Reviewer models read the prose and cannot see
//        that an id is dead; only a lookup can. This module is that lookup. It is deterministic apart from its fetches and
//        takes the fetch function as an argument, so the offline suite runs it with no network.
// SCOPE  It proves existence and label/title agreement. It does NOT prove a source supports the claim around it: a real,
//        well-labelled paper cited for something it never says passes. The reviewer ensemble stays the check for that.
// USAGE  const r = await citationGate(markdown, { fetch });  -> { pass, retry, failures, unverified, refs }
//        pass   true when no reference failed and none is unverified
//        retry  true when the only problem is a network or server error (try again next tick; do not park the paper)
//        failures[]  { kind, id, status: "not-found" | "title-mismatch", ... }: block release and hold the queue row
// INTEGRATION (a separate change, worker.js is claimed by another session until it lapses): call citationGate() beside the
//        pseudoMathScan pre-publish gate in publishStageV2; on pass=false set research_queue.status='held' with the failure
//        text (never a silent drop), on retry=true leave the row queued. The papers row keeps its status; only the queue row
//        is held, so a live paper is never taken down by a flaky lookup.

const ARXIV_NEW = "\\d{4}\\.\\d{4,5}";
const ARXIV_OLD = "[a-z]+(?:-[a-z]+)?(?:\\.[A-Z]{2})?\\/\\d{7}";
const ARXIV_RE = new RegExp("arxiv(?:\\.org\\/(?:abs|pdf)\\/|[:\\s]+(?:abs\\/)?)\\s*(" + ARXIV_NEW + "|" + ARXIV_OLD + ")(?:v\\d+)?", "gi");
const DOI_RE = /(?:doi\.org\/|doi:\s*)(10\.\d{4,9}\/[^\s)\]>"']+)/gi;
const URL_RE = /\bhttps?:\/\/[^\s)\]>"']+/gi;
const STOP = new Set("with from that this have into over under about their there which where when what than then also only more most some such been being were will would could should between within without".split(" "));

function words(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
}

// A reference's label is what names the cited work: the text of the markdown link that holds the id, or, on a reference-list
// line ("- Title, arXiv 1234.5678"), the line itself. A prose sentence that cites two papers names neither, so it has no label
// and the id is judged on existence only (judging it against the sentence made every two-citation sentence a false mismatch).
function labelOf(line, id) {
  const lid = String(id).toLowerCase();
  const re = /\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[2].toLowerCase().includes(lid)) return stripIds(m[1]);
  }
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
    const links = line.match(/\[[^\]]*\]\([^)\s]+\)/g) || [];
    if (links.length <= 1) return stripIds(line.replace(/\[([^\]]*)\]\([^)\s]+\)/g, "$1"));
  }
  return "";
}
function stripIds(s) {
  return s.replace(URL_RE, " ").replace(ARXIV_RE, " ").replace(/\bdoi:?\s*10\.\S+/gi, " ").replace(/\barxiv\b/gi, " ");
}

// Title-vs-label agreement: only judged when the label carries at least three significant words, otherwise a bare
// "[arXiv 1234.5678]" would be failed for having no title.
export function titleAgrees(label, title) {
  const lw = Array.from(new Set(words(label)));
  const tw = Array.from(new Set(words(title)));
  if (lw.length < 3 || tw.length < 2) return { judged: false, ok: true, score: null };
  const lset = new Set(lw);
  const hit = tw.filter((w) => lset.has(w)).length;
  const score = hit / Math.min(lw.length, tw.length);
  return { judged: true, ok: score >= 0.5, score: Math.round(score * 100) / 100 };
}

// Every reference in a markdown body, with the line it sits on.
export function extractRefs(md) {
  const refs = [];
  const seen = new Set();
  const lines = String(md || "").split(/\r?\n/);
  const push = (kind, id, line) => {
    const key = kind + ":" + id.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ kind, id, line });
  };
  for (const line of lines) {
    let m;
    ARXIV_RE.lastIndex = 0;
    while ((m = ARXIV_RE.exec(line))) push("arxiv", m[1], line);
    DOI_RE.lastIndex = 0;
    while ((m = DOI_RE.exec(line))) push("doi", m[1].replace(/[.,;]+$/, ""), line);
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(line))) {
      const u = m[0].replace(/[.,;]+$/, "");
      if (/arxiv\.org\/(?:abs|pdf)\//i.test(u) || /doi\.org\//i.test(u)) continue; // already an arxiv or doi ref
      if (/^https?:\/\/(?:[a-z0-9-]+\.)*qnfo\.org(?:\/|$)/i.test(u)) continue; // the fleet's own pages are not citations
      push("url", u, line);
    }
  }
  return refs;
}

function entryTitle(entry) {
  const m = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

// arXiv API: one call for all ids. A missing id is an entry titled "Error" (id under /api/errors) or no entry at all.
async function lookupArxiv(ids, fetchFn) {
  const out = {};
  if (!ids.length) return out;
  let res;
  try {
    res = await fetchFn("https://export.arxiv.org/api/query?max_results=" + ids.length + "&id_list=" + encodeURIComponent(ids.join(",")), { headers: { "User-Agent": "qnfo-citation-gate/1.0" } });
  } catch (e) {
    for (const id of ids) out[id] = { state: "error", note: String(e && e.message || e).slice(0, 120) };
    return out;
  }
  if (!res.ok) {
    for (const id of ids) out[id] = { state: "error", note: "arXiv API HTTP " + res.status };
    return out;
  }
  const xml = await res.text();
  const entries = xml.split(/<entry>/i).slice(1).map((e) => e.split(/<\/entry>/i)[0]);
  const byId = {};
  for (const e of entries) {
    const idm = e.match(/<id>\s*https?:\/\/arxiv\.org\/(?:abs|api\/errors)\/?([^<\s]*)\s*<\/id>/i);
    const isErr = /arxiv\.org\/api\/errors/i.test(e) || /^error$/i.test(entryTitle(e));
    if (!idm || isErr) continue;
    byId[idm[1].replace(/v\d+$/, "").toLowerCase()] = entryTitle(e);
  }
  for (const id of ids) {
    const t = byId[id.toLowerCase()];
    out[id] = t === undefined ? { state: "not-found" } : { state: "ok", title: t };
  }
  return out;
}

async function lookupDoi(doi, fetchFn) {
  try {
    const r = await fetchFn("https://doi.org/api/handles/" + doi.split("/").map(encodeURIComponent).join("/"), { headers: { "User-Agent": "qnfo-citation-gate/1.0" } });
    if (r.status === 404) return { state: "not-found" };
    if (!r.ok) return { state: "error", note: "doi.org HTTP " + r.status };
    const j = await r.json();
    if (j.responseCode === 100) return { state: "not-found" };
    if (j.responseCode !== 1) return { state: "error", note: "handle responseCode " + j.responseCode };
  } catch (e) {
    return { state: "error", note: String(e && e.message || e).slice(0, 120) };
  }
  // Title from Crossref when the DOI is a Crossref one; DataCite DOIs (Zenodo) have no Crossref entry, so no title is judged.
  try {
    const c = await fetchFn("https://api.crossref.org/works/" + doi.split("/").map(encodeURIComponent).join("/"), { headers: { "User-Agent": "qnfo-citation-gate/1.0 (mailto:ops@qnfo.org)" } });
    if (c.ok) {
      const cj = await c.json();
      const t = cj && cj.message && cj.message.title && cj.message.title[0];
      if (t) return { state: "ok", title: String(t) };
    }
  } catch (e) { /* existence is already proven by the handle */ }
  return { state: "ok" };
}

async function lookupUrl(url, fetchFn) {
  try {
    const r = await fetchFn(url, { method: "GET", redirect: "follow", headers: { "User-Agent": "qnfo-citation-gate/1.0" } });
    if (r.status === 404 || r.status === 410) return { state: "not-found" };
    if (r.ok) return { state: "ok" };
    return { state: "error", note: "HTTP " + r.status }; // 403, 429 and 5xx prove nothing about the page
  } catch (e) {
    return { state: "error", note: String(e && e.message || e).slice(0, 120) };
  }
}

export async function citationGate(md, opts) {
  const fetchFn = (opts && opts.fetch) || fetch;
  const maxUrls = (opts && opts.maxUrls) || 40;
  const refs = extractRefs(md);
  const ax = refs.filter((r) => r.kind === "arxiv");
  const arx = await lookupArxiv(ax.map((r) => r.id.replace(/v\d+$/, "")), fetchFn);
  const failures = [];
  const unverified = [];
  const out = [];
  const queue = refs.filter((r) => r.kind !== "arxiv");
  const urls = queue.filter((r) => r.kind === "url");
  const skipped = urls.slice(maxUrls); // recorded, never silently dropped
  const work = queue.filter((r) => r.kind === "doi" || urls.indexOf(r) < maxUrls);
  const done = {};
  let next = 0;
  async function worker() {
    while (next < work.length) {
      const r = work[next++];
      done[r.kind + ":" + r.id] = r.kind === "doi" ? await lookupDoi(r.id, fetchFn) : await lookupUrl(r.id, fetchFn);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  for (const r of refs) {
    const res = r.kind === "arxiv" ? arx[r.id.replace(/v\d+$/, "")] : done[r.kind + ":" + r.id];
    if (!res) { out.push({ kind: r.kind, id: r.id, status: "skipped-over-limit" }); continue; }
    if (res.state === "not-found") {
      const f = { kind: r.kind, id: r.id, status: "not-found" };
      failures.push(f); out.push(f); continue;
    }
    if (res.state === "error") {
      const u = { kind: r.kind, id: r.id, status: "unverified", note: res.note };
      unverified.push(u); out.push(u); continue;
    }
    if (res.title) {
      const t = titleAgrees(labelOf(r.line, r.id), res.title);
      if (t.judged && !t.ok) {
        const f = { kind: r.kind, id: r.id, status: "title-mismatch", title: res.title, score: t.score };
        failures.push(f); out.push(f); continue;
      }
    }
    out.push({ kind: r.kind, id: r.id, status: "ok", title: res.title || null });
  }
  return {
    pass: failures.length === 0 && unverified.length === 0,
    retry: failures.length === 0 && unverified.length > 0,
    failures,
    unverified,
    skipped: skipped.map((r) => r.id),
    refs: out,
  };
}

export function describeFailures(result) {
  const parts = result.failures.map((f) => f.kind + " " + f.id + " " + f.status + (f.title ? " (resolves to: " + f.title + ")" : ""));
  return "CITATION-EXISTENCE-GATE-1: " + (parts.join("; ") || "no failures");
}
