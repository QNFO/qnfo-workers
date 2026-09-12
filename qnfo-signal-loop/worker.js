const VERSION = "1.1.0-l8-consume";
const WORKER = "qnfo-signal-loop";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
function nowIso() { return new Date().toISOString(); }
function sigId(source, ref) {
  return source + ":" + String(ref || "").replace(/[^a-z0-9]+/gi, "-").slice(0, 80);
}

async function ensureSchema(env) {
  await env.QNFO_AUDIT.prepare(`CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY, ts TEXT, source TEXT, source_ref TEXT, content TEXT,
    open_questions TEXT, evidential_weight REAL, domain TEXT,
    status TEXT DEFAULT 'new', decision TEXT, score REAL, created_at TEXT
  )`).run();
  await env.QNFO_AUDIT.prepare(`CREATE TABLE IF NOT EXISTS signal_worker_boundary (
    worker TEXT NOT NULL, source TEXT NOT NULL, permitted INTEGER DEFAULT 1,
    domain TEXT, note TEXT, PRIMARY KEY (worker, source)
  )`).run();
}

function extractOpenQuestions(bodyMd) {
  if (!bodyMd) return [];
  const out = [];
  const m = String(bodyMd).match(/##?\s*(Open Questions?|Future Work|Open Problems?)[\s\S]{0,4000}/i);
  if (m) {
    const lines = m[0].split("\n").filter(l => /^[-*\d.]\s*\S/.test(l.trim())).map(l => l.trim()).slice(0, 15);
    for (const l of lines) out.push(l.slice(0, 300));
  }
  return out;
}

async function runReentry(env) {
  await ensureSchema(env);
  const papers = await env.LIVING_PAPER.prepare(
    `SELECT slug, doi, title, body_md, version FROM papers WHERE doi IS NOT NULL AND doi != '' ORDER BY created_at DESC LIMIT 500`
  ).all();
  const rows = papers.results || [];
  const out = { scanned: rows.length, emitted: 0, skipped: 0, errors: 0, signals: [] };
  for (const p of rows) {
    const doi = p.doi;
    const existing = await env.QNFO_AUDIT.prepare(
      `SELECT id FROM signals WHERE source = 'artifact_reentry' AND source_ref = ? LIMIT 1`
    ).bind(doi).first();
    if (existing) { out.skipped++; continue; }
    const oq = extractOpenQuestions(p.body_md);
    const eps = oq.length > 0 ? 0.9 : 0.0;
    try {
      await env.QNFO_AUDIT.prepare(
        `INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(sigId("artifact_reentry", doi), nowIso(), "artifact_reentry", doi, String(p.title || "").slice(0, 500), JSON.stringify(oq), eps, "research", "new", nowIso()).run();
      out.emitted++;
      out.signals.push({ doi, open_questions: oq.length, evidential_weight: eps, title: String(p.title || "").slice(0, 120) });
    } catch (e) { out.errors++; }
  }
  return out;
}

async function checkBoundary(env, worker, source) {
  const row = await env.QNFO_AUDIT.prepare(
    `SELECT * FROM signal_worker_boundary WHERE worker = ? AND source = ?`
  ).bind(worker, source).first();
  return { worker, source, permitted: row ? (row.permitted === 1) : false, row: row || null };
}

async function runConsume(env, commit) {
  await ensureSchema(env);
  // L8 consumption: re-entry signals with eps>0 re-enter L1 triage via idea_proposals.
  // Boundary-enforced: qnfo-signal-loop may consume only artifact_reentry (seeded in B).
  const rows = await env.QNFO_AUDIT.prepare(
    `SELECT * FROM signals WHERE source = 'artifact_reentry' AND status = 'new' AND evidential_weight > 0 ORDER BY created_at LIMIT 25`
  ).all();
  const out = { candidate: (rows.results || []).length, consumed: 0, proposals: 0, skipped_no_questions: 0, skipped_boundary: 0, errors: 0 };
  for (const s of (rows.results || [])) {
    let oq = [];
    try { oq = JSON.parse(s.open_questions || "[]"); } catch (e) { oq = []; }
    if (!Array.isArray(oq) || !oq.length) { out.skipped_no_questions++; continue; }
    const b = await env.QNFO_AUDIT.prepare(
      `SELECT permitted FROM signal_worker_boundary WHERE worker = 'qnfo-signal-loop' AND source = 'artifact_reentry'`
    ).first();
    if (!b || Number(b.permitted) !== 1) { out.skipped_boundary++; continue; }
    if (!commit) { out.consumed++; out.proposals += oq.length; continue; }
    let ok = true;
    for (const q of oq) {
      try {
        await env.QNFO_AUDIT.prepare(
          `INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?,?,?,?,?,?)`
        ).bind("auto-reentry", "Re-entry from " + String(s.source_ref || "").slice(0, 120) + ": " + String(q).slice(0, 1800), "auto", "new", "l8-reentry", new Date().toISOString()).run();
        out.proposals++;
      } catch (e) { out.errors++; ok = false; }
    }
    if (ok) await env.QNFO_AUDIT.prepare(`UPDATE signals SET status = 'consumed' WHERE id = ?`).bind(s.id).run();
    out.consumed++;
  }
  return out;
}

export default {
  async scheduled(event, env) {
    if (event.cron === "0 * * * *") {
      try { const r = await runReentry(env); console.log(JSON.stringify({ worker: WORKER, reentry: r })); }
      catch (e) { console.log(WORKER + " reentry error: " + e.message); }
      try { const c = await runConsume(env, true); console.log(JSON.stringify({ worker: WORKER, consume: c })); }
      catch (e) { console.log(WORKER + " consume error: " + e.message); }
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
    try {
      if (p === "/health") {
        await ensureSchema(env);
        return json({ ok: true, worker: WORKER, version: VERSION, bindings: { audit: !!env.QNFO_AUDIT, living_paper: !!env.LIVING_PAPER } });
      }
      if (p === "/run/reentry") {
        const r = await runReentry(env);
        return json({ ok: true, ...r });
      }
      if (p === "/run/consume") {
        const commit = url.searchParams.get("commit") === "1";
        const r = await runConsume(env, commit);
        return json({ ok: true, commit, ...r });
      }
      if (p === "/signals") {
        const lim = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
        const rows = await env.QNFO_AUDIT.prepare(`SELECT * FROM signals ORDER BY created_at DESC LIMIT ${lim}`).all();
        return json({ count: rows.results.length, signals: rows.results });
      }
      if (p === "/boundary") {
        const rows = await env.QNFO_AUDIT.prepare(`SELECT worker, source, permitted, domain FROM signal_worker_boundary ORDER BY domain, worker`).all();
        return json({ count: rows.results.length, boundary: rows.results });
      }
      if (p === "/check") {
        const w = url.searchParams.get("worker") || "";
        const s = url.searchParams.get("source") || "";
        if (!w || !s) return json({ error: "worker and source required" }, 400);
        return json(await checkBoundary(env, w, s));
      }
      return json({ error: "not found", path: p }, 404);
    } catch (e) {
      return json({ error: "server error: " + e.message }, 500);
    }
  }
};
