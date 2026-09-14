
const MEM_DECAY_HALF_LIFE_DAYS = 90;
const MEM_PRUNE_EFFECTIVE_IMPORTANCE = 0.1;

function corsHeaders(origin) {
  return { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "https://qnfo.org" };
}

async function runMemoryMaintain(env, opts) {
  opts = opts || {};
  const commit = !!opts.commit;
  const result = { status: "memory-maintained", plane: "personal", commit, timestamp: new Date().toISOString(), scanned: 0, decayed: 0, expired: 0, deduped: 0, pruned: 0, ids: [] };
  try {
    const rows = await env.PERSONAL_DB.prepare("SELECT id, category, content, summary, importance, session_id, created_at, expires_at, metadata_json FROM agent_memories").all();
    const mems = rows.results || [];
    result.scanned = mems.length;
    const now = Date.now();
    const pruneIds = new Set();
    for (const m of mems) {
      const importance = m.importance != null ? Number(m.importance) : 0.7;
      if (m.expires_at) {
        const exp = new Date(m.expires_at).getTime();
        if (!isNaN(exp) && exp <= now) { pruneIds.add(m.id); result.expired++; continue; }
      }
      const created = new Date(m.created_at).getTime();
      if (isNaN(created)) continue;
      const ageDays = (now - created) / 864e5;
      const effective = importance * Math.pow(0.5, ageDays / MEM_DECAY_HALF_LIFE_DAYS);
      if (effective < MEM_PRUNE_EFFECTIVE_IMPORTANCE) { pruneIds.add(m.id); result.decayed++; }
    }
    const byCat = {};
    for (const mm of mems) {
      if (pruneIds.has(mm.id)) continue;
      const contentKey = String(mm.content || "").toLowerCase().replace(/\s+/g, " ").trim();
      const metaKey = String(mm.metadata_json || "").replace(/\s+/g, " ").trim();
      const key = mm.category + "::" + contentKey + "::" + metaKey;
      if (!byCat[key]) byCat[key] = [];
      byCat[key].push(mm);
    }
    for (const k in byCat) {
      const group = byCat[k];
      if (group.length < 2) continue;
      group.sort((a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0));
      for (let g = 1; g < group.length; g++) {
        const dup = group[g];
        if (pruneIds.has(dup.id)) continue;
        pruneIds.add(dup.id);
        result.deduped++;
      }
    }
    if (commit && pruneIds.size) {
      const ids = Array.from(pruneIds);
      for (let c = 0; c < ids.length; c += 100) {
        const chunk = ids.slice(c, c + 100);
        // VZ FIRST (self-healing): a D1 failure leaves rows that re-prune next run; a VZ failure after D1 delete would orphan vectors permanently.
        await env.VZ.deleteByIds(chunk).catch((e) => console.error("[twin-maintain] VZ delete error:", e.message));
        const ph = chunk.map(() => "?").join(",");
        await env.PERSONAL_DB.prepare("DELETE FROM agent_memories WHERE id IN (" + ph + ")").bind(...chunk).run();
      }
    }
    result.pruned = pruneIds.size;
    result.ids = Array.from(pruneIds).slice(0, 50);
    if (commit) {
      await env.PERSONAL_DB.prepare("INSERT INTO memory_maintain_runs (run_id, plane, scanned, pruned, decayed, expired, deduped, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind("memory-maintain-" + Date.now(), "personal", result.scanned, result.pruned, result.decayed, result.expired, result.deduped, "Memory maintain: " + result.scanned + " scanned, " + result.pruned + " pruned").run().catch(() => {});
    }
  } catch (e) { result.error = e.message; }
  return result;
}

async function getLastRun(env) {
  try {
    const r = await env.PERSONAL_DB.prepare("SELECT run_id, scanned, pruned, decayed, expired, deduped, created_at FROM memory_maintain_runs ORDER BY created_at DESC LIMIT 1").first();
    return r || null;
  } catch (e) { return null; }
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url), p = u.pathname;
    const origin = request.headers.get("Origin") || "https://qnfo.org";
    const h = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (p === "/health") {
      const lastRun = await getLastRun(env);
      return new Response(JSON.stringify({ status: "ok", worker: "qnfo-twin-maintain", version: "1.0.1", plane: "personal", features: ["memory-maintain"], lastRun }), { headers: h });
    }
    if (p === "/run/memory-maintain") {
      const q = new URL(request.url).searchParams;
      const commit = q.get("commit") === "1" || q.get("commit") === "true";
      // HARDENING: destructive commit requires POST (CSRF-safe); GET is dry-run only.
      if (commit && request.method !== "POST") return new Response(JSON.stringify({ error: "commit requires POST" }), { status: 405, headers: h });
      const result = await runMemoryMaintain(env, { commit });
      return new Response(JSON.stringify(result), { headers: h });
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: h });
  },
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log("[qnfo-twin-maintain] cron triggered:", cron);
    try {
      if (cron === "0 4 * * *") await runMemoryMaintain(env, { commit: true });
    } catch (e) { console.error("[qnfo-twin-maintain] cron error:", e.message); }
  }
};
