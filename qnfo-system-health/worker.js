// qnfo-system-health - daily fleet endpoint watcher.
// VERSION 1.0.1 (2026-09-06). Canonical repo: QNFO/qnfo-workers/qnfo-system-health (re-homed from deployed bundle 2026-09-06; FLEET-SELF-DOC-1).
// v1.0.1: added gateway (qnfo.org) + error-selfheal endpoints; honest UP/DOWN labels (500/530 no longer labelled UP).
const UA = "Mozilla/5.0 (QNFO system-health)";
const ENDPOINTS = [
  { name: "qnfo-ai", url: "https://qnfo-ai.q08.workers.dev/health" },
  { name: "personal-api", url: "https://personal-api.q08.workers.dev/health" },
  { name: "cloud-ops", url: "https://qnfo-cloud-ops.q08.workers.dev/health" },
  { name: "kaizen", url: "https://qnfo-kaizen.q08.workers.dev/health" },
  { name: "research-radar", url: "https://qnfo-research-radar.qnfo.org/health" },
  { name: "citation-watch", url: "https://qnfo-citation-watch.qnfo.org/health" },
  { name: "paper-indexer", url: "https://qnfo-paper-indexer.q08.workers.dev/health" },
  { name: "gateway", url: "https://qnfo.org/health" },
  { name: "error-selfheal", url: "https://qnfo-error-selfheal.q08.workers.dev/health" }
];
function pad(n) { return String(n).padStart(2, "0"); }
async function run(env) {
  const lines = [];
  let up = 0;
  for (const e of ENDPOINTS) {
    try {
      const t0 = Date.now();
      const r = await fetch(e.url, { headers: { "User-Agent": UA } });
      const ms = Date.now() - t0;
      const healthy = r.ok;
      const ok = healthy ? "UP" : "DOWN(" + r.status + ")";
      if (healthy) up++;
      lines.push("- " + e.name + " | " + ok + " | " + ms + "ms");
    } catch (e) {
      lines.push("- " + e.name + " | DOWN | " + String((e && e.message) || e).slice(0, 80));
    }
  }
  const d = new Date();
  const ymd = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const key = "notes/v1/" + d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + ymd + "/_system-health-" + ymd + ".md";
  const body = "# System Health Check " + ymd + "\n\nEndpoints: " + up + "/" + ENDPOINTS.length + " healthy\n\n" + lines.join("\n") + "\n";
  let wrote = false;
  try {
    if (env.VAULT) { await env.VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } }); wrote = true; }
  } catch (e) {}
  return { status: "ok", up: up, total: ENDPOINTS.length, noteKey: key, wrote: wrote };
}
export default {
  async scheduled(event, env, ctx) {
    try {
      const out = await run(env);
      console.log("system-health", JSON.stringify(out));
    } catch (e) {
      console.error("system-health", String((e && e.message) || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-system-health", version: "1.0.1" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/run") {
      const out = await run(env);
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};
