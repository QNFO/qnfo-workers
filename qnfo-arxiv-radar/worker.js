// qnfo-arxiv-radar — arXiv watch to outreach_queue
// CANONICAL SOURCE. Restored: this file was missing from the repo; only
// deployed-current.worker.js (the compiled bundle) was present, while README.md
// declared "Canonical source: this directory (QNFO/qnfo-workers)".
//
// VERSION 1.0.2 — adds the response-status check that 1.0.1 lacked.
//
// WHAT WAS WRONG (1.0.1, verified in the deployed bundle, sha 4d800c92…):
//
//   const r = await fetch("https://export.arxiv.org/api/query?...&sortBy=submittedDate&sortOrder=descending", {...});
//   const txt = await r.text();
//   const entries = txt.split("<entry>").slice(1);      // <-- no r.ok check
//
// On a 429 (arXiv rate-limits sorted queries aggressively — reproduced live
// 2026-09-13, 4 of 5 probes) the body contains no <entry> tags, so:
//   entries = []  ->  out.hits = 0  ->  out.error stays null
// and the worker reports "0 hits, 0 strong candidates" as a SUCCESS.
//
// That is the silent-zero-output defect class: a worker that runs, returns 200,
// produces nothing, and files no ticket. It is invisible to /health probes (which
// ask only "does it answer?") and to the ticket advisor (which files from health).
//
// FIXES: (1) check r.ok and record a real error; (2) never persist or report an
// empty result from a failed request; (3) descriptive User-Agent with contact info,
// as arXiv's API terms require; (4) back off on 429 instead of retrying immediately.

export default {
  async scheduled(event, env, ctx) {
    try {
      const out = await run(env);
      // FAIL LOUDLY: a zero-candidate run is a signal, not a success.
      if (out.error || (out.hits === 0 && !out.degraded)) {
        console.error("arxiv-radar DEGRADED", JSON.stringify(out));
      } else {
        console.log("arxiv-radar", JSON.stringify(out));
      }
    } catch (e) {
      console.error("arxiv-radar", String((e && e.message) || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-arxiv-radar", version: "1.0.2" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/run") {
      const out = await run(env);
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};

const WIDE_QUERY = '(all:"ultrametric" OR all:"p-adic" OR all:"Bruhat-Tits" OR all:"quantum energy" OR all:"joules per solution" OR all:"quantum error correction" OR all:"ZBW" OR all:"quantum thermodynamics" OR all:"Landauer" OR all:"energy per logical qubit" OR all:"Margolus-Levitin" OR all:"cryogenic controller" OR all:"primon" OR all:"Gentile statistics" OR all:"adelic" OR all:"arithmetic quantum") AND (cat:quant-ph OR cat:math-ph OR cat:hep-th OR cat:cs.ET)';
const STRONG = ["ultrametric","p-adic","bruhat","primon","adelic","gentile","joules","landauer","margolus","quantum energy","error correction","thermodynamics","logical qubit","zbw","arithmetic","energy overhead","energy efficiency","cryogenic"];

// arXiv API terms require a User-Agent identifying the client with contact info.
// A browser-spoofed UA is throttled harder and risks a ban.
const UA = "QNFO-arxiv-radar/1.0.2 (+https://qnfo.org; contact: ops@qnfo.org)";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [3000, 9000, 27000]; // arXiv asks for >=3s between calls

function pad(n) { return String(n).padStart(2, "0"); }

// Fetch with an explicit status contract:
//   { ok: true,  text }          -> 200, body is Atom XML
//   { ok: false, status, text }  -> any non-200; caller MUST NOT treat as empty
async function fetchAtom(url) {
  let last = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/atom+xml" } });
    const text = await r.text();
    if (r.ok) return { ok: true, status: r.status, text };
    last = { ok: false, status: r.status, text: text.slice(0, 300) };
    // 429 / 5xx are retryable; 4xx (other than 429) are not.
    const retryable = r.status === 429 || r.status >= 500;
    if (!retryable || attempt === MAX_ATTEMPTS - 1) return last;
    await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt]));
  }
  return last;
}

async function run(env) {
  const out = { hits: 0, candidates: 0, enqueued: 0, dupes: 0, noteKey: null, error: null, degraded: false, sample: [] };
  const q = encodeURIComponent(WIDE_QUERY);
  const url = "https://export.arxiv.org/api/query?search_query=" + q +
              "&start=0&max_results=20&sortBy=submittedDate&sortOrder=descending";

  const res = await fetchAtom(url);

  // ---- THE FIX: a failed request is an ERROR, never an empty result set. ----
  if (!res.ok) {
    out.error = "arxiv http " + res.status + " after " + MAX_ATTEMPTS + " attempts" +
                (res.status === 429 ? " (rate limited)" : "") +
                " body=" + JSON.stringify(res.text).slice(0, 120);
    out.degraded = true;
    // Do NOT write a note, do NOT report 0 candidates as a finding, do NOT enqueue.
    // Surface it so a zero-output alarm can fire.
    if (env.AUDIT) {
      try {
        await env.AUDIT.prepare(
          "INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, datetime('now'), 'arxiv-radar-error', ?, ?, 'qnfo-arxiv-radar', 'fail')"
        ).bind("ar-" + Date.now().toString(36), "arxiv fetch failed: http " + res.status,
               JSON.stringify({ status: res.status })).run();
      } catch (e) {}
    }
    return out;
  }

  // 200 with zero entries is ALSO suspicious (arXiv always has recent submissions
  // matching this query) — flag it rather than reporting a clean empty run.
  const entries = res.text.split("<entry>").slice(1);
  const hits = [];
  for (const en of entries) {
    const t = (en.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const id = (en.match(/<id>[\s\S]*?arxiv\.org\/abs\/([^<]+)<\/id>/) || [])[1] || "";
    const pub = (en.match(/<published>([^<]+)<\/published>/) || [])[1] || "";
    const sum = (en.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || "";
    const authors = [];
    const am = en.match(/<name>([\s\S]*?)<\/name>/g) || [];
    for (const a of am) authors.push(a.replace(/<\/?name>/g, "").trim());
    if (t) hits.push({ id: id.trim(), title: t.replace(/\s+/g, " ").trim().slice(0, 220), published: pub.slice(0, 10), authors: authors.slice(0, 6), text: (t + " " + sum).replace(/\s+/g, " ").toLowerCase() });
  }
  out.hits = hits.length;

  if (hits.length === 0) {
    out.degraded = true;
    out.error = "http 200 but 0 entries parsed — arXiv returned a non-Atom body or the query matched nothing";
    if (env.AUDIT) {
      try {
        await env.AUDIT.prepare(
          "INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, datetime('now'), 'arxiv-radar-empty', ?, ?, 'qnfo-arxiv-radar', 'fail')"
        ).bind("ar-" + Date.now().toString(36), out.error, JSON.stringify({ body_head: res.text.slice(0, 200) })).run();
      } catch (e) {}
    }
    return out;
  }

  const candidates = [];
  for (const h of hits) {
    let score = 0;
    for (const kw of STRONG) if (h.text.includes(kw)) score++;
    if (score >= 1) candidates.push(h);
  }
  out.candidates = candidates.length;
  out.sample = candidates.slice(0, 5).map((c) => c.id + " " + c.title.slice(0, 60));

  const lines = [];
  for (const c of candidates.slice(0, 15)) {
    lines.push("- [" + c.id + "] " + c.title + " (" + c.published + ") " + c.authors.slice(0, 3).join(", "));
  }
  const d = new Date();
  const ymd = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const key = "notes/v1/" + d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + ymd + "/_arxiv-radar-" + ymd + ".md";
  const body = "# arXiv Radar " + ymd + "\n\nWidened scan: " + hits.length + " hits, " + candidates.length + " strong candidates\n\n" + lines.join("\n") + "\n";
  try {
    if (env.VAULT) { await env.VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } }); out.noteKey = key; }
  } catch (e) {}

  if (env.AUDIT) {
    for (const c of candidates.slice(0, 8)) {
      try {
        const dup = await env.AUDIT.prepare("SELECT 1 AS x FROM outreach_queue WHERE paper_id=?1 LIMIT 1").bind(c.id.slice(0, 40)).first();
        if (dup) { out.dupes++; continue; }
        await env.AUDIT.prepare("INSERT INTO outreach_queue (id, paper_id, author, email, reason, status, created_at) VALUES (?1,?2,?3,NULL,?4,'pending', datetime('now'))").bind("aq-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), c.id.slice(0, 40), "", "arxiv-radar widened: " + c.title.slice(0, 120)).run();
        out.enqueued++;
      } catch (e) {}
    }
  }
  return out;
}
