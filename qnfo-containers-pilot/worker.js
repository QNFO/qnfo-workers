// qnfo-containers-pilot v0.2.0
// Cloudflare Containers executor -- Docker-free Python exec + workspace FS, audit-logged.
// PURPOSE: cloud-native Python execution on the QNFO fleet (Containers, Workers Paid).
// v0.2.0: AUDIT D1 logging to cloud_ops_events (row 93 DoD); /workspace/write + /workspace/read
// (row 94 executor-side e2e); output caps + path-traversal guard (row 99 executor-side subset).
// CAPABILITIES (Bearer PILOT_TOKEN, fail-closed):
//   GET  /health             static liveness (ungated)
//   GET  /version            python --version via exec() (logged)
//   GET  /status             container.running (scale-to-zero probe)
//   POST /exec               python -c <code> via exec() (logged)
//   POST /workspace/write    write file under /workspace (base64, logged)
//   POST /workspace/read     read file under /workspace (base64, logged)
// DEPLOY: cd qnfo-workers/qnfo-containers-pilot && wrangler deploy
// CANONICAL SOURCE: QNFO/qnfo-workers/qnfo-containers-pilot
// SECRET: wrangler secret put PILOT_TOKEN

const VERSION = "0.3.0";
const MAX_CODE = 40000;
const MAX_OUT = 60000;
const WORKSPACE = "/workspace";

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

function safeRel(p) {
  let rel = String(p || "").replace(/^\/+/g, "");
  if (!rel) return null;
  if (rel.split("/").indexOf("..") >= 0) return null;
  if (rel.indexOf("\\") >= 0) return null;
  return rel;
}

async function logEvent(env, kind, text, meta, job, status) {
  if (!env || !env.AUDIT) return { ok: false, reason: "no AUDIT binding" };
  try {
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : (String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10));
    const ts = new Date().toISOString();
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ts, String(kind).slice(0, 200), String(text || "").slice(0, 2000), meta ? JSON.stringify(meta).slice(0, 4000) : null, job || null, status || "ok")
      .run();
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 500) };
  }
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
        await logEvent(this.env, "container.version", "python --version", { stdout: out.stdout, exitCode: out.exitCode }, null, out.exitCode === 0 ? "ok" : "error");
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
        if (code.length > MAX_CODE) return json({ ok: false, error: "code too long (max " + MAX_CODE + ")" }, 413);
        const argv = Array.isArray(body.argv) ? body.argv : [];
        await this.ensureStarted();
        const out = await this.run(["python", "-c", code].concat(argv));
        await logEvent(this.env, "container.exec", "python -c <code>", { exitCode: out.exitCode, stdoutLen: out.stdout.length, stderrLen: out.stderr.length, stdoutTruncated: out.stdoutTruncated, stderrTruncated: out.stderrTruncated }, null, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: true, containerRunning: this.ctx.container.running, result: out });
      }

      if (path === "/sh") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        let body = {};
        try { body = await request.json(); } catch (e) { body = {}; }
        const cmd = typeof body.cmd === "string" ? body.cmd : "";
        if (!cmd) return json({ ok: false, error: "body.cmd (string) required" }, 400);
        if (cmd.length > MAX_CODE) return json({ ok: false, error: "cmd too long (max " + MAX_CODE + ")" }, 413);
        await this.ensureStarted();
        const out = await this.run(["sh", "-c", cmd]);
        await logEvent(this.env, "container.sh", "sh -c <cmd>", { exitCode: out.exitCode, stdoutLen: out.stdout.length, stderrLen: out.stderr.length }, null, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: true, containerRunning: this.ctx.container.running, result: out });
      }

      if (path === "/workspace/write") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        let body = {};
        try { body = await request.json(); } catch (e) { body = {}; }
        const rel = safeRel(body.path);
        if (!rel) return json({ ok: false, error: "body.path required, must be under /workspace, no .." }, 400);
        const content = typeof body.content === "string" ? body.content : "";
        if (!content && content !== "") return json({ ok: false, error: "body.content (string) required" }, 400);
        const b64 = btoa(unescape(encodeURIComponent(content)));
        const code = "import base64,os,sys,pathlib; p=sys.argv[1]; os.makedirs(os.path.dirname(p) or '.', exist_ok=True); pathlib.Path(p).write_bytes(base64.b64decode(sys.argv[2])); print('WROTE', len(sys.argv[2]))";
        await this.ensureStarted();
        const out = await this.run(["python", "-c", code, "/workspace/" + rel, b64]);
        const ok = out.exitCode === 0;
        await logEvent(this.env, "container.workspace_write", "write /workspace/" + rel, { exitCode: out.exitCode, bytes: content.length, path: rel }, null, ok ? "ok" : "error");
        return json({ ok: ok, containerRunning: this.ctx.container.running, result: out });
      }

      if (path === "/workspace/read") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        let body = {};
        try { body = await request.json(); } catch (e) { body = {}; }
        const rel = safeRel(body.path);
        if (!rel) return json({ ok: false, error: "body.path required, must be under /workspace, no .." }, 400);
        const code = "import base64,pathlib,sys; print(base64.b64encode(pathlib.Path(sys.argv[1]).read_bytes()).decode())";
        await this.ensureStarted();
        const out = await this.run(["python", "-c", code, "/workspace/" + rel]);
        let content = null;
        if (out.exitCode === 0) {
          try { content = decodeURIComponent(escape(atob(out.stdout.trim()))); } catch (e) { content = null; }
        }
        await logEvent(this.env, "container.workspace_read", "read /workspace/" + rel, { exitCode: out.exitCode, path: rel, bytes: content ? content.length : null }, null, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, containerRunning: this.ctx.container.running, path: rel, content: content, result: { exitCode: out.exitCode, stderr: out.stderr } });
      }

      return json({ ok: false, error: "not found", path: path }, 404);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      try { await logEvent(this.env, "container.error", "handler error: " + msg, {}, null, "error"); } catch (le) {}
      return json({ ok: false, error: msg }, 500);
    }
  }

  async ensureStarted() {
    if (!this.ctx.container.running) {
      await this.ctx.container.start({ entrypoint: ["python", "-m", "http.server", "8080"], enableInternet: true });
    }
  }

  async run(cmd) {
    const proc = await this.ctx.container.exec(cmd);
    const output = await proc.output();
    const dec = new TextDecoder();
    let stdout = dec.decode(output.stdout);
    let stderr = dec.decode(output.stderr);
    let stdoutTruncated = false;
    let stderrTruncated = false;
    if (stdout.length > MAX_OUT) { stdout = stdout.slice(0, MAX_OUT); stdoutTruncated = true; }
    if (stderr.length > MAX_OUT) { stderr = stderr.slice(0, MAX_OUT); stderrTruncated = true; }
    return {
      exitCode: output.exitCode,
      stdout: stdout,
      stderr: stderr,
      stdoutTruncated: stdoutTruncated,
      stderrTruncated: stderrTruncated,
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
