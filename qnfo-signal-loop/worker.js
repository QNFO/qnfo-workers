const VERSION = "1.0.0-l8-loop";
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

export default {
  async scheduled(event, env) {
    if (event.cron === "0 * * * *") {
      try { const r = await runReentry(env); console.log(JSON.stringify({ worker: WORKER, ...r })); }
      catch (e) { console.log(WORKER + " reentry error: " + e.message); }
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
