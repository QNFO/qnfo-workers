var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.1.1";
var WORKER = "qnfo-code-orchestrator";
var CODE_AGENT = "https://qnfo-code-agent.q08.workers.dev";
var MAX_OUT = 65536;
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
__name(json, "json");
function randId(p) {
  return p + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
}
__name(randId, "randId");
function iso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(iso, "iso");
function capOut(s) {
  s = String(s || "");
  return { text: s.slice(0, MAX_OUT), truncated: s.length > MAX_OUT };
}
__name(capOut, "capOut");
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(sha256hex, "sha256hex");
async function authed(env, req) {
  const h = req.headers.get("authorization") || "";
  const tok = h.replace(/^Bearer\s+/i, "").trim();
  if (!tok || !env.ORCH_TOKEN) return false;
  const a = await sha256hex(tok);
  const b = await sha256hex(env.ORCH_TOKEN);
  return a === b;
}
__name(authed, "authed");
async function audit(env, kind, text, meta, status) {
  try {
    if (!env.AUDIT_DB) return;
    const t = String(text || "").slice(0, 500);
    const m = meta ? JSON.stringify(meta).slice(0, 1e3) : null;
    await env.AUDIT_DB.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)").bind(randId("ce_"), iso(), kind, t, m, WORKER, status || "ok").run();
  } catch (e) {
  }
}
__name(audit, "audit");
var PyContainer = class {
  static {
    __name(this, "PyContainer");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  async ensureStarted() {
    if (!this.ctx.container.running) {
      await this.ctx.container.start({ entrypoint: ["python", "-m", "http.server", "8080"] });
    }
  }
  async run(code) {
    const proc = await this.ctx.container.exec(["python", "-c", code]);
    const out = await proc.output();
    const dec = new TextDecoder();
    const so = capOut(dec.decode(out.stdout));
    const se = capOut(dec.decode(out.stderr));
    return { exitCode: out.exitCode, stdout: so.text, stdoutTruncated: so.truncated, stderr: se.text, stderrTruncated: se.truncated };
  }
  async fetch(request) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === "/exec") {
      if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
      let body = {};
      try {
        body = await request.json();
      } catch (e) {
        body = {};
      }
      const code = typeof body.code === "string" ? body.code : "";
      if (!code) return json({ ok: false, error: "body.code required" }, 400);
      await this.ensureStarted();
      const out = await this.run(code);
      await audit(this.env, "orchestrator.exec", "exec: " + String(code).slice(0, 80), { exitCode: out.exitCode }, out.exitCode === 0 ? "ok" : "error");
      return json({ ok: true, result: out });
    }
    if (p === "/task") {
      if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
      let body = {};
      try {
        body = await request.json();
      } catch (e) {
        body = {};
      }
      const repo = String(body.repo || "qnfo-workers").trim();
      const path = String(body.path || "README.md").trim();
      let readResult = { ok: false, error: "code-agent read failed" };
      try {
        const rr = await fetch(CODE_AGENT + "/v1/repo/read", {
          method: "POST",
          headers: { "Authorization": "Bearer " + (this.env.CODE_AGENT_KEY || ""), "Content-Type": "application/json", "User-Agent": "qnfo-code-orchestrator" },
          body: JSON.stringify({ repo, path, maxChars: 4e3 })
        });
        readResult = await rr.json();
      } catch (e) {
        readResult = { ok: false, error: String(e && e.message || e) };
      }
      let execResult;
      try {
        await this.ensureStarted();
        execResult = await this.run("print('orchestrator-container-ok'); import sys; print('python', sys.version.split()[0])");
      } catch (e) {
        execResult = { exitCode: -1, stdout: "", stdoutTruncated: false, stderr: String(e && e.message || e), stderrTruncated: false };
      }
      const readOk = readResult.ok === true;
      const resp = {
        ok: readOk,
        repo,
        path,
        read: readOk ? { ok: true, sha: readResult.sha || null, size: readResult.size || null, contentHead: String(readResult.content || "").slice(0, 240) } : { ok: false, status: readResult.status || null, error: readResult.error || "read failed", contentHead: "" },
        exec: execResult
      };
      await audit(this.env, "orchestrator.task", "task " + repo + "/" + path, { readOk, readStatus: readResult.status || null, execExit: execResult.exitCode }, readOk ? "ok" : "error");
      return json(resp, readOk ? 200 : 502);
    }
    return json({ ok: false, error: "not found", path: p }, 404);
  }
};
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["orchestrator", "github-read", "container-exec", "server-side", "integration-slice"] });
    }
    if (!await authed(env, req)) return json({ ok: false, error: "unauthorized (ORCH_TOKEN required)" }, 401);
    const id = env.PY_CONTAINER.idFromName("default");
    return env.PY_CONTAINER.get(id).fetch(req);
  }
};
export {
  PyContainer,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
