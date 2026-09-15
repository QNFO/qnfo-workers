var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "1.1.2";
var WORKER = "qnfo-signal-loop";
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function sigId(source, ref) {
  return source + ":" + String(ref || "").replace(/[^a-z0-9]+/gi, "-").slice(0, 80);
}
__name(sigId, "sigId");
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
__name(ensureSchema, "ensureSchema");
function extractOpenQuestions(bodyMd) {
  if (!bodyMd) return [];
  const text = String(bodyMd);
  const out = [];
  const seen = new Set();
  const push = (s) => {
    const t = String(s).replace(/\s+/g, " ").replace(/^[\s*\-\d.]+/, "").trim();
    if (t.length < 15 || t.length > 320) return;
    const k = t.slice(0, 80).toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    if (out.length < 15) out.push(t);
  };
  const m = text.match(/##?\s*(Open Questions?|Open Problems?|Future Work|Future Directions?|Limitations?|Outlook|Unresolved|Discussion)[\s\S]{0,4000}/i);
  if (m) { for (const l of m[0].split("\n")) { if (/^\s*([-*]|\d+\.)\s+\S/.test(l)) push(l); } }
  const inline = text.match(/[^.\n]{12,300}?(open question|remains? open|open problem|unresolved|future work|not yet (known|understood|resolved|established)|unknown whether|remains? to be)[^.\n]{0,240}[.?]/gi) || [];
  for (const s of inline) push(s);
  const qs = text.match(/[^.\n?]{25,300}\?/g) || [];
  for (const s of qs) push(s);
  return out;
}
__name(extractOpenQuestions, "extractOpenQuestions");
async function runReentry(env) {
  await ensureSchema(env);
  const papers = await env.LIVING_PAPER.prepare(
    `SELECT slug, doi, title FROM papers WHERE doi IS NOT NULL AND doi != '' AND body_md IS NOT NULL AND body_md != '' ORDER BY created_at DESC LIMIT 500`
  ).all();
  const rows = papers.results || [];
  const out = { scanned: rows.length, emitted: 0, rescored: 0, skipped: 0, errors: 0, signals: [] };
  for (const p of rows) {
    const doi = p.doi;
    const existing = await env.QNFO_AUDIT.prepare(
      `SELECT id, evidential_weight FROM signals WHERE source = 'artifact_reentry' AND source_ref = ? LIMIT 1`
    ).bind(doi).first();
    let bodyMd = "";
    try {
      const pr = await env.LIVING_PAPER.prepare(
        `SELECT substr(body_md, 1, 12000) AS b FROM papers WHERE doi = ? LIMIT 1`
      ).bind(doi).first();
      bodyMd = pr && pr.b ? pr.b : "";
    } catch (e) { out.errors++; }
    const oq = extractOpenQuestions(bodyMd);
    const eps = oq.length > 0 ? 0.9 : 0;
    if (existing) {
      if (Number(existing.evidential_weight || 0) === 0 && eps > 0) {
        try {
          await env.QNFO_AUDIT.prepare(
            `UPDATE signals SET open_questions = ?, evidential_weight = ? WHERE id = ?`
          ).bind(JSON.stringify(oq), eps, existing.id).run();
          out.rescored++;
        } catch (e) { out.errors++; }
      } else { out.skipped++; }
      continue;
    }
    try {
      await env.QNFO_AUDIT.prepare(
        `INSERT OR IGNORE INTO signals (id, ts, source, source_ref, content, open_questions, evidential_weight, domain, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(sigId("artifact_reentry", doi), nowIso(), "artifact_reentry", doi, String(p.title || "").slice(0, 500), JSON.stringify(oq), eps, "research", "new", nowIso()).run();
      out.emitted++;
      if (eps > 0) out.signals.push({ doi, open_questions: oq.length, evidential_weight: eps, title: String(p.title || "").slice(0, 100) });
    } catch (e) { out.errors++; }
  }
  return out;
}
__name(runReentry, "runReentry");
async function checkBoundary(env, worker, source) {
  const row = await env.QNFO_AUDIT.prepare(
    `SELECT * FROM signal_worker_boundary WHERE worker = ? AND source = ?`
  ).bind(worker, source).first();
  return { worker, source, permitted: row ? row.permitted === 1 : false, row: row || null };
}
__name(checkBoundary, "checkBoundary");
async function runConsume(env, commit) {
  await ensureSchema(env);
  const rows = await env.QNFO_AUDIT.prepare(
    `SELECT * FROM signals WHERE source = 'artifact_reentry' AND status = 'new' AND evidential_weight > 0 ORDER BY created_at LIMIT 25`
  ).all();
  const out = { candidate: (rows.results || []).length, consumed: 0, proposals: 0, skipped_no_questions: 0, skipped_boundary: 0, errors: 0 };
  for (const s of rows.results || []) {
    let oq = [];
    try {
      oq = JSON.parse(s.open_questions || "[]");
    } catch (e) {
      oq = [];
    }
    if (!Array.isArray(oq) || !oq.length) {
      out.skipped_no_questions++;
      continue;
    }
    const b = await env.QNFO_AUDIT.prepare(
      `SELECT permitted FROM signal_worker_boundary WHERE worker = 'qnfo-signal-loop' AND source = 'artifact_reentry'`
    ).first();
    if (!b || Number(b.permitted) !== 1) {
      out.skipped_boundary++;
      continue;
    }
    if (!commit) {
      out.consumed++;
      out.proposals += oq.length;
      continue;
    }
    let ok = true;
    for (const q of oq) {
      try {
        await env.QNFO_AUDIT.prepare(
          `INSERT INTO idea_proposals (name, idea, contact, status, ip_hash, created_at) VALUES (?,?,?,?,?,?)`
        ).bind("auto-reentry", "Re-entry from " + String(s.source_ref || "").slice(0, 120) + ": " + String(q).slice(0, 1800), "auto", "new", "l8-reentry", (/* @__PURE__ */ new Date()).toISOString()).run();
        out.proposals++;
      } catch (e) {
        out.errors++;
        ok = false;
      }
    }
    if (ok) await env.QNFO_AUDIT.prepare(`UPDATE signals SET status = 'consumed' WHERE id = ?`).bind(s.id).run();
    out.consumed++;
  }
  return out;
}
__name(runConsume, "runConsume");
var worker_default = {
  async scheduled(event, env) {
    if (event.cron === "0 * * * *") {
      try {
        const r = await runReentry(env);
        console.log(JSON.stringify({ worker: WORKER, reentry: r }));
      } catch (e) {
        console.log(WORKER + " reentry error: " + e.message);
      }
      try {
        const c = await runConsume(env, true);
        console.log(JSON.stringify({ worker: WORKER, consume: c }));
      } catch (e) {
        console.log(WORKER + " consume error: " + e.message);
      }
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
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map