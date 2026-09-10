import { WorkflowEntrypoint } from "cloudflare:workers";

export default {
  async scheduled(event, env, ctx) {
    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    await env.JOB_MARKET_WATCH.create({ id: "cron-" + stamp, params: { trigger: "cron" } });
  },
  async fetch(request) {
    // v1.1.0: health route (was missing -> HTTP probes 500/1101 on every fleet probe)
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, worker: "job-market-watch", version: "1.1.0" }), { headers: { "content-type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  }
};

export class JobMarketWatchWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const date = new Date().toISOString().slice(0, 10);
    const boards = await step.do("scan-sources", {
      retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
      timeout: "90 seconds"
    }, async () => {
      const out = [];
      try {
        const r = await fetch("https://api.lever.co/v0/postings/epoch-ai?mode=json");
        if (r.ok) { const j = await r.json(); out.push({ source: "epoch", channel: "RED", roles: (Array.isArray(j) ? j : []).map(x => x.text || "").filter(Boolean).slice(0, 12) }); }
        else out.push({ source: "epoch", channel: "RED", error: "HTTP " + r.status });
      } catch (e) { out.push({ source: "epoch", channel: "RED", error: e.message }); }
      try {
        const r = await fetch("https://api.ashbyhq.com/posting-api/job-board/quantware");
        if (r.ok) { const j = await r.json(); out.push({ source: "quantware", channel: "RED", roles: (j.jobs || []).map(x => x.title).slice(0, 12) }); }
        else out.push({ source: "quantware", channel: "RED", error: "HTTP " + r.status });
      } catch (e) { out.push({ source: "quantware", channel: "RED", error: e.message }); }
      try {
        const r = await fetch("https://forecastingresearch.org/careers");
        if (r.ok) {
          const html = await r.text();
          const titles = [];
          for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([^<]{8,80})/g)) {
            const t = m[2].trim();
            if (/Senior|Research|Analyst|Fellow|Researcher|Data/.test(t) && titles.length < 12) titles.push(t);
          }
          out.push({ source: "fri", channel: "GREEN", roles: titles, email: html.includes("info@forecastingresearch.org") });
        } else out.push({ source: "fri", channel: "GREEN", error: "HTTP " + r.status });
      } catch (e) { out.push({ source: "fri", channel: "GREEN", error: e.message }); }
      return out;
    });

    const report = await step.do("build-report", {}, async () => {
      const lines = ["# JOB MARKET WATCH (CLOUD WORKFLOW)", "", "> Generated " + new Date().toISOString(), "", "## Scan results", ""];
      for (const b of boards) {
        lines.push("### " + b.source + " [" + b.channel + "]");
        if (b.roles && b.roles.length) lines.push(b.roles.map(function(x){ return "- " + x; }).join(String.fromCharCode(10)));
        if (b.error) lines.push("- ERROR: " + b.error);
        if (b.email !== undefined) lines.push("- email channel: " + (b.email ? "yes (GREEN - automated application possible)" : "no"));
      }
      lines.push("", "## CHANNEL-1 POLICY", "GREEN = direct email application (automatable). RED = form-ATS (track only, recruit-at-large).");
      return lines.join(String.fromCharCode(10));
    });

    const key = "notes/v1/" + date.slice(0, 4) + "/" + date.slice(5, 7) + "/" + date + "/_job-market-watch-workflow-" + date + ".md";
    const delivered = await step.do("deliver-r2", { retries: { limit: 2, delay: "3 seconds" } }, async () => {
      await this.env.VAULT.put(key, report, { httpMetadata: { contentType: "text/markdown" } });
      return key;
    });

    const handoff_id = await step.do("record-d1", {}, async () => {
      const res = await this.env.AUDIT.prepare("INSERT INTO handoffs (session_id, project_id, phase_completed, summary, pending_work, next_action, r2_handoff_path, timestamp, wbs_code) VALUES (?,?,?,?,?,?,?,?,?)")
        .bind("cloud-workflow", "job-market-watch-workflow-" + date, "1", "Cloud workflow scan: " + boards.length + " boards (" + boards.filter(b => b.channel === "GREEN").length + " GREEN / " + boards.filter(b => b.channel === "RED").length + " RED)", "none - autonomous", "next: weekly Tuesday fire (0 7 * * 2)", key, new Date().toISOString(), "CLOUD-WORKFLOW-2026-09-08")
        .run();
      return res.meta.last_row_id;
    });

    return { boards: boards.length, green: boards.filter(b => b.channel === "GREEN").length, red: boards.filter(b => b.channel === "RED").length, key: delivered, handoff_id: handoff_id };
  }
}
