// qnfo-containers-pilot v0.1.0
// PURPOSE: Cloudflare Containers pilot + fleet reference for cloud-native Python
// execution. Runs a public python:3.12-slim image inside a Durable-Object-managed
// container (registry image reference -> NO local Docker required). Drives the
// container with ctx.container.exec() to run Python and stream stdout/stderr/exit
// codes back to the caller.
// CAPABILITIES:
//   GET  /health   static liveness, no container start (ungated)
//   GET  /version  python --version via exec() (gated)
//   GET  /status   container.running, scale-to-zero probe (gated)
//   POST /exec     run python -c <code> via exec() (gated)
// DEPLOY: cd qnfo-workers/qnfo-containers-pilot && wrangler deploy
// CANONICAL SOURCE: QNFO/qnfo-workers/qnfo-containers-pilot
// SECRET: wrangler secret put PILOT_TOKEN  (fail-closed when unset)

const VERSION = "0.1.0";

function json(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function authorized(request, env) {
  const token = env.PILOT_TOKEN;
  if (!token) return false; // fail closed
  const auth = request.headers.get("Authorization") || "";
  const expected = "Bearer " + token;
  const a = new Uint8Array(new TextEncoder().encode(auth));
  const b = new Uint8Array(new TextEncoder().encode(expected));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export class PyContainer {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!authorized(request, this.env)) {
      return json({ ok: false, error: "unauthorized (PILOT_TOKEN required)" }, 401);
    }

    try {
      if (path === "/version") {
        await this.ensureStarted();
        const out = await this.run(["python", "--version"]);
        return json({ ok: true, containerRunning: this.ctx.container.running, result: out });
      }
      if (path === "/status") {
        return json({ ok: true, containerRunning: this.ctx.container.running });
      }
      if (path === "/exec") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        let body = {};
        try { body = await request.json(); } catch (e) { body = {}; }
        const code = typeof body.code === "string" ? body.code : "";
        if (!code) return json({ ok: false, error: "body.code (string) required" }, 400);
        const argv = Array.isArray(body.argv) ? body.argv : [];
        await this.ensureStarted();
        const out = await this.run(["python", "-c", code].concat(argv));
        return json({ ok: true, containerRunning: this.ctx.container.running, result: out });
      }
      return json({ ok: false, error: "not found", path: path }, 404);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      return json({ ok: false, error: msg }, 500);
    }
  }

  async ensureStarted() {
    if (!this.ctx.container.running) {
      await this.ctx.container.start({ entrypoint: ["python", "-m", "http.server", "8080"] });
    }
  }

  async run(cmd) {
    const proc = await this.ctx.container.exec(cmd);
    const output = await proc.output();
    const dec = new TextDecoder();
    return {
      exitCode: output.exitCode,
      stdout: dec.decode(output.stdout),
      stderr: dec.decode(output.stderr),
    };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, worker: "qnfo-containers-pilot", version: VERSION, capability: "cloudflare-containers" });
    }
    const id = env.PY_CONTAINER.idFromName("default");
    const stub = env.PY_CONTAINER.get(id);
    return stub.fetch(request);
  },
};
