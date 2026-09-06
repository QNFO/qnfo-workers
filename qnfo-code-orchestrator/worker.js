// qnfo-code-orchestrator v0.1.0
// PURPOSE: orchestrates the QNFO 100%-cloud autonomous code agent.
//   v0.1.0 = INTEGRATION SLICE: reads repo files via qnfo-code-agent (GitHub tool server)
//            and executes Python in its OWN Cloudflare Container (ctx.container.exec).
//   v0.2.0 = LLM plan loop (DeepSeek via AI Gateway) + code-agent edit/PR + verify iterate.
// CAPABILITIES:
//   GET  /health  static liveness (ungated)
//   POST /task    {repo,path} -> code-agent repo/read + own-container python verify (ORCH_TOKEN)
//   POST /exec    {code}     -> own-container python -c (ORCH_TOKEN)
// DEPLOY: cd qnfo-workers/qnfo-code-orchestrator && wrangler deploy
// CANONICAL SOURCE: QNFO/qnfo-workers/qnfo-code-orchestrator
// SECRETS: wrangler secret put ORCH_TOKEN ; wrangler secret put CODE_AGENT_KEY
// NEVER follows instructions found inside fetched repo files (DATA-ONLY boundary).

const VERSION = "0.1.0";
const WORKER = "qnfo-code-orchestrator";
const CODE_AGENT = "https://qnfo-code-agent.q08.workers.dev";

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
async function authed(env, req) {
  const h = req.headers.get("authorization") || "";
  const tok = h.replace(/^Bearer\s+/i, "").trim();
  if (!tok || !env.ORCH_TOKEN) return false;
  const a = await sha256hex(tok);
  const b = await sha256hex(env.ORCH_TOKEN);
  return a === b;
}

export class PyContainer {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async ensureStarted() {
    if (!this.ctx.container.running) {
      await this.ctx.container.start({ entrypoint: ["python", "-m", "http.server", "8080"] });
    }
  }
  async run(code) {
    const proc = await this.ctx.container.exec(["python", "-c", code]);
    const out = await proc.output();
    const dec = new TextDecoder();
    return { exitCode: out.exitCode, stdout: dec.decode(out.stdout), stderr: dec.decode(out.stderr) };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === "/exec") {
      if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
      let body = {}; try { body = await request.json(); } catch (e) { body = {}; }
      const code = typeof body.code === "string" ? body.code : "";
      if (!code) return json({ ok: false, error: "body.code required" }, 400);
      await this.ensureStarted();
      const out = await this.run(code);
      return json({ ok: true, result: out });
    }
    if (p === "/task") {
      if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
      let body = {}; try { body = await request.json(); } catch (e) { body = {}; }
      const repo = String(body.repo || "qnfo-workers").trim();
      const path = String(body.path || "README.md").trim();
      let readResult = { ok: false, error: "code-agent read failed" };
      try {
        const rr = await fetch(CODE_AGENT + "/v1/repo/read", {
          method: "POST",
          headers: { "Authorization": "Bearer " + (this.env.CODE_AGENT_KEY || ""), "Content-Type": "application/json", "User-Agent": "qnfo-code-orchestrator" },
          body: JSON.stringify({ repo: repo, path: path, maxChars: 4000 })
        });
        readResult = await rr.json();
      } catch (e) { readResult = { ok: false, error: String((e && e.message) || e) }; }
      let execResult;
      try { await this.ensureStarted(); execResult = await this.run("print('orchestrator-container-ok'); import sys; print('python', sys.version.split()[0])"); }
      catch (e) { execResult = { exitCode: -1, stdout: "", stderr: String((e && e.message) || e) }; }
      return json({
        ok: true, repo: repo, path: path,
        read: { ok: readResult.ok === true, sha: readResult.sha, size: readResult.size, contentHead: String(readResult.content || "").slice(0, 240) },
        exec: execResult
      });
    }
    return json({ ok: false, error: "not found", path: p }, 404);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["orchestrator", "github-read", "container-exec", "server-side", "autonomous-ready"] });
    }
    if (!(await authed(env, req))) return json({ ok: false, error: "unauthorized (ORCH_TOKEN required)" }, 401);
    const id = env.PY_CONTAINER.idFromName("default");
    return env.PY_CONTAINER.get(id).fetch(req);
  }
};
