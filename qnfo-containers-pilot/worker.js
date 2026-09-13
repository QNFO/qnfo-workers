// qnfo-containers-pilot v1.0.0
// Full-stack shell execution on Cloudflare Containers (Firecracker VM).
// Image: nikolaik/python-nodejs:python3.12-nodejs22 (Python 3.12 + Node.js 22 + npm)
// Startup: installs git + ripgrep + curl via apt-get on first cold start (~10-15s)
// ROUTES (Bearer PILOT_TOKEN, fail-closed):
//   GET  /health              static liveness
//   GET  /status              container.running probe
//   POST /sh                  bash -c <cmd> (full shell, internet-enabled)
//   POST /exec                python3 -c <code>
//   POST /node                node -e <code>
//   POST /pip                 pip install <packages>
//   POST /npm                 npm install <packages> in /workspace
//   POST /git/clone           git clone <url> into /workspace/<name>
//   POST /git/op              git <op> in /workspace/<repo>
//   POST /workspace/write     write file under /workspace
//   POST /workspace/read      read file under /workspace
//   POST /workspace/ls        ls under /workspace
//   POST /workspace/exec      sh -c <cmd> in /workspace/<dir>
const VERSION = "1.0.0";
const MAX_CMD = 65536;
const MAX_OUT = 131072;
const WORKSPACE = "/workspace";

function json(data, status) {
  return new Response(JSON.stringify(data, null, 2), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
function authorized(request, env) {
  const token = env.PILOT_TOKEN;
  if (!token) return false;
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
async function logEvent(env, kind, text, meta, status) {
  if (!env || !env.AUDIT) return;
  try {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, ts, String(kind).slice(0, 200), String(text || "").slice(0, 2000), meta ? JSON.stringify(meta).slice(0, 4000) : null, "qnfo-containers-pilot", status || "ok").run();
  } catch (e) {}
}

export class ShellContainer {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this._initialized = false; }

  async ensureStarted() {
    if (this.ctx.container.running) return;
    await this.ctx.container.start({ entrypoint: ["bash", "-c", "mkdir -p /workspace && sleep infinity"], enableInternet: true });
    await this.run(["bash", "-c", "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git curl ripgrep 2>&1 | tail -3; git config --global user.email 'ops@qnfo.org'; git config --global user.name 'QNFO ops'; echo INIT_DONE"]);
    this._initialized = true;
  }

  async run(cmd) {
    const proc = await this.ctx.container.exec(cmd);
    const output = await proc.output();
    const dec = new TextDecoder();
    let stdout = dec.decode(output.stdout);
    let stderr = dec.decode(output.stderr);
    const stdoutTruncated = stdout.length > MAX_OUT;
    const stderrTruncated = stderr.length > MAX_OUT;
    if (stdoutTruncated) stdout = stdout.slice(0, MAX_OUT) + "\n...[TRUNCATED]";
    if (stderrTruncated) stderr = stderr.slice(0, MAX_OUT) + "\n...[TRUNCATED]";
    return { exitCode: output.exitCode, stdout, stderr, stdoutTruncated, stderrTruncated };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!authorized(request, this.env)) return json({ ok: false, error: "unauthorized (PILOT_TOKEN required)" }, 401);
    try {
      if (path === "/sh") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const cmd = String(body.cmd || "").trim();
        const cwd = body.cwd ? String(body.cwd) : null;
        if (!cmd) return json({ ok: false, error: "body.cmd required" }, 400);
        if (cmd.length > MAX_CMD) return json({ ok: false, error: "cmd too long" }, 413);
        await this.ensureStarted();
        const cdPrefix = cwd ? "cd " + JSON.stringify(cwd) + " && " : "";
        const out = await this.run(["bash", "-c", cdPrefix + cmd]);
        await logEvent(this.env, "container.sh", cmd.slice(0, 200), { exitCode: out.exitCode }, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, result: out });
      }
      if (path === "/exec") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const code = String(body.code || "");
        const argv = Array.isArray(body.argv) ? body.argv : [];
        if (!code) return json({ ok: false, error: "body.code required" }, 400);
        await this.ensureStarted();
        const out = await this.run(["python3", "-c", code, ...argv]);
        await logEvent(this.env, "container.exec", "python3 -c", { exitCode: out.exitCode }, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, result: out });
      }
      if (path === "/node") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const code = String(body.code || "");
        const cwd = body.cwd ? String(body.cwd) : WORKSPACE;
        if (!code) return json({ ok: false, error: "body.code required" }, 400);
        await this.ensureStarted();
        const out = await this.run(["bash", "-c", "cd " + JSON.stringify(cwd) + " && node -e " + JSON.stringify(code)]);
        return json({ ok: out.exitCode === 0, result: out });
      }
      if (path === "/pip") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const packages = Array.isArray(body.packages) ? body.packages.map(String) : [String(body.packages || "")];
        if (!packages.length || !packages[0]) return json({ ok: false, error: "packages required" }, 400);
        await this.ensureStarted();
        const out = await this.run(["pip", "install", "--quiet", ...packages]);
        await logEvent(this.env, "container.pip", packages.join(" "), { exitCode: out.exitCode }, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, packages, result: out });
      }
      if (path === "/npm") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const packages = Array.isArray(body.packages) ? body.packages.map(String) : [String(body.packages || "")];
        const cwd = body.cwd ? String(body.cwd) : WORKSPACE;
        await this.ensureStarted();
        await this.run(["bash", "-c", "cd " + JSON.stringify(cwd) + " && [ -f package.json ] || npm init -y > /dev/null 2>&1"]);
        const out = await this.run(["bash", "-c", "cd " + JSON.stringify(cwd) + " && npm install --save " + packages.join(" ") + " 2>&1 | tail -5"]);
        return json({ ok: out.exitCode === 0, packages, cwd, result: out });
      }
      if (path === "/git/clone") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const repoUrl = String(body.url || "").trim();
        const branch = body.branch ? String(body.branch) : null;
        const depth = parseInt(body.depth, 10) || 1;
        const name = body.name ? safeRel(String(body.name)) : repoUrl.split("/").pop().replace(/\.git$/, "");
        if (!repoUrl) return json({ o
