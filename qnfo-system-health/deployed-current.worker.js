var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var UA = "Mozilla/5.0 (QNFO system-health)";
var URL_ENDPOINTS = [
  { name: "research-radar", url: "https://qnfo-research-radar.qnfo.org/health" },
  { name: "citation-watch", url: "https://qnfo-citation-watch.qnfo.org/health" },
  { name: "gateway", url: "https://qnfo.org/health" }
];
var SVC_ENDPOINTS = [
  { name: "qnfo-ai", binding: "QNFO_AI" },
  { name: "personal-api", binding: "PERSONAL_API" },
  { name: "cloud-ops", binding: "CLOUD_OPS" },
  { name: "kaizen", binding: "KAIZEN" },
  { name: "paper-indexer", binding: "PAPER_INDEXER" },
  { name: "error-selfheal", binding: "ERROR_SELFHEAL" }
];
function pad(n) {
  return String(n).padStart(2, "0");
}
__name(pad, "pad");
async function run(env) {
  const lines = [];
  let up = 0;
  const check = /* @__PURE__ */ __name(async (name, probe) => {
    try {
      const t0 = Date.now();
      const r = await probe();
      const ms = Date.now() - t0;
      const healthy = r.ok;
      const ok = healthy ? "UP" : "DOWN(" + r.status + ")";
      if (healthy) up++;
      lines.push("- " + name + " | " + ok + " | " + ms + "ms");
    } catch (e) {
      lines.push("- " + name + " | DOWN | " + String(e && e.message || e).slice(0, 80));
    }
  }, "check");
  for (const e of URL_ENDPOINTS) {
    await check(e.name, () => fetch(e.url, { headers: { "User-Agent": UA } }));
  }
  for (const e of SVC_ENDPOINTS) {
    await check(e.name, () => {
      const svc = env[e.binding];
      if (!svc) throw new Error("missing binding " + e.binding);
      return svc.fetch("https://internal/health", { headers: { "User-Agent": UA } });
    });
  }
  const d = /* @__PURE__ */ new Date();
  const ymd = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const key = "notes/v1/" + d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + ymd + "/_system-health-" + ymd + ".md";
  const body = "# System Health Check " + ymd + "\n\nEndpoints: " + up + "/" + (URL_ENDPOINTS.length + SVC_ENDPOINTS.length) + " healthy\n\n" + lines.join("\n") + "\n";
  let wrote = false;
  try {
    if (env.VAULT) {
      await env.VAULT.put(key, body, { httpMetadata: { contentType: "text/markdown" } });
      wrote = true;
    }
  } catch (e) {
  }
  return { status: "ok", up, total: URL_ENDPOINTS.length + SVC_ENDPOINTS.length, noteKey: key, wrote };
}
__name(run, "run");
var worker_default = {
  async scheduled(event, env, ctx) {
    try {
      const out = await run(env);
      console.log("system-health", JSON.stringify(out));
    } catch (e) {
      console.error("system-health", String(e && e.message || e));
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-system-health", version: "1.0.2" }), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/run") {
      const out = await run(env);
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
