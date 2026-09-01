// personal-lifecycle v1.0.0 — Personal Twin-plane memory maintainer
// Mirrors qnfo-lifecycle runMemoryMaintain (proven QNFO-plane pattern, v1.6.1-memory-maintain-fixed).
// PLANE: personal — binds ONLY personal-life D1 + personal-life Vectorize (PERSONAL-QNFO-SEPARATION-1 physical partition).
// Decay: importance * 0.5^(ageDays/90); prune when effective importance < 0.1; expiry via expires_at;
// dedup by category+normalized content; prune deletes D1 rows + best-effort VZ deleteByIds.
// Routes: /health, /run/memory-maintain?commit=1|0. Cron: 0 4 * * * (commit:true).
// Source: QNFO/qnfo-workers (git). Deploy: wrangler deploy from this directory.

const MEM_DECAY_HALF_LIFE_DAYS = 90;
const MEM_PRUNE_EFFECTIVE_IMPORTANCE = 0.1;

function corsHeaders(origin) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "https://personal.q08.workers.dev"
  };
}

async function runMemoryMaintain(env, opts) {
  opts = opts || {};
  var commit = !!opts.commit;
  var result = { status: "memory-maintained", plane: "personal", commit: commit, timestamp: new Date().toISOString(), scanned: 0, decayed: 0, expired: 0, deduped: 0, pruned: 0, ids: [] };
  try {
    var rows = await env.PERSONAL.prepare("SELECT id, category, content, summary, importance, session_id, created_at, expires_at FROM agent_memories").all();
    var mems = rows.results || [];
    result.scanned = mems.length;
    var now = Date.now();
    var pruneIds = new Set();
    for (var i = 0; i < mems.length; i++) {
      var m = mems[i];
      var importance = m.importance != null ? Number(m.importance) : 0.7;
      if (m.expires_at) {
        var exp = new Date(m.expires_at).getTime();
        if (!isNaN(exp) && exp <= now) { pruneIds.add(m.id); result.expired++; continue; }
      }
      var created = new Date(m.created_at).getTime();
      if (isNaN(created)) continue;
      var ageDays = (now - created) / 864e5;
      var effective = importance * Math.pow(0.5, ageDays / MEM_DECAY_HALF_LIFE_DAYS);
      if (effective < MEM_PRUNE_EFFECTIVE_IMPORTANCE) { pruneIds.add(m.id); result.decayed++; }
    }
    var byCat = {};
    for (var j = 0; j < mems.length; j++) {
      var mm = mems[j];
      if (pruneIds.has(mm.id)) continue;
      var key = mm.category + "::" + String(mm.content || "").toLowerCase().replace(/\s+/g, " ").trim();
      if (!byCat[key]) byCat[key] = [];
      byCat[key].push(mm);
    }
    for (var k in byCat) {
      var group = byCat[k];
      if (group.length < 2) continue;
      group.sort(function(a, b) { return (Number(b.importance) || 0) - (Number(a.importance) || 0); });
      for (var g = 1; g < group.length; g++) {
        var dup = group[g];
        if (pruneIds.has(dup.id)) continue;
        pruneIds.add(dup.id);
        result.deduped++;
      }
    }
    if (commit && pruneIds.size) {
      var ids = Array.from(pruneIds);
      for (var c = 0; c < ids.length; c += 100) {
        var chunk = ids.slice(c, c + 100);
        var ph = chunk.map(function() { return "?"; }).join(",");
        await env.PERSONAL.prepare("DELETE FROM agent_memories WHERE id IN (" + ph + ")").bind(...chunk).run();
        await env.VZ.deleteByIds(chunk).catch(function(e) {
          console.error("[personal-lifecycle] VZ delete error:", e.message);
        });
      }
    }
    result.pruned = pruneIds.size;
    result.ids = Array.from(pruneIds).slice(0, 50);
    if (commit) {
      await env.PERSONAL.prepare("INSERT INTO memory_maintain_runs (run_id, plane, scanned, pruned, decayed, expired, deduped, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind("memory-maintain-" + Date.now(), "personal", result.scanned, result.pruned, result.decayed, result.expired, result.deduped, "Personal plane maintain: " + result.scanned + " scanned, " + result.pruned + " pruned")
        .run().catch(function() {});
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

function health() {
  return JSON.stringify({
    status: "ok",
    worker: "personal-lifecycle",
    version: "1.0.0",
    plane: "personal",
    cronSchedules: 1,
    features: ["memory-maintain"]
  });
}

export default {
  async fetch(request, env) {
    const u = new URL(request.url), p = u.pathname;
    const origin = request.headers.get("Origin") || "https://personal.q08.workers.dev";
    const h = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (p === "/health") return new Response(health(), { headers: h });
    if (p === "/run/memory-maintain") {
      const q = new URL(request.url).searchParams;
      const commit = q.get("commit") === "1" || q.get("commit") === "true";
      const result = await runMemoryMaintain(env, { commit });
      return new Response(JSON.stringify(result), { headers: h });
    }
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: h });
  },
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log("[personal-lifecycle] cron triggered:", cron);
    try {
      if (cron === "0 4 * * *") await runMemoryMaintain(env, { commit: true });
    } catch (e) {
      console.error("[personal-lifecycle] cron error:", e.message);
    }
  }
};
