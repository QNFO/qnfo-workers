// qnfo-containers-pilot v1.0.0
// Full-stack shell execution on Cloudflare Containers (Firecracker VM).
// Image: nikolaik/python-nodejs:python3.12-nodejs22 (Python 3.12 + Node.js 22 + npm)
// Startup: installs git + ripgrep + curl via apt-get on first cold start (~10-15s)
// ROUTES (Bearer PILOT_TOKEN, fail-closed):
//   GET  /health              static liveness
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
//   GET  /status              container.running probe
const VERSION = "1.0.0";
const MAX_CMD = 65536;
const MAX_OUT = 131072;
const WORKSPACE = "/workspace";

function json(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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
  const rel = String(p || "").replace(/^\/+/g, "");
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
    await env.AUDIT.prepare(
      "INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id, ts,
      String(kind).slice(0, 200),
      String(text || "").slice(0, 2000),
      meta ? JSON.stringify(meta).slice(0, 4000) : null,
      "qnfo-containers-pilot",
      status || "ok"
    ).run();
  } catch (e) {}
}

export class ShellContainer {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this._initialized = false;
  }

  async ensureStarted() {
    if (this.ctx.container.running) return;
    await this.ctx.container.start({
      entrypoint: ["bash", "-c", "mkdir -p /workspace && sleep infinity"],
      enableInternet: true,
    });
    // Install essential tools on first boot (~10-15s cold start)
    await this.run([
      "bash", "-c",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git curl ripgrep 2>&1 | tail -3; " +
      "git config --global user.email ops@qnfo.org; " +
      "git config --global user.name 'QNFO ops'; " +
      "echo INIT_DONE"
    ]);
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

    if (!authorized(request, this.env)) {
      return json({ ok: false, error: "unauthorized (PILOT_TOKEN required)" }, 401);
    }

    try {
      // /sh — full bash execution
      if (path === "/sh") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const cmd = String(body.cmd || "").trim();
        const cwd = body.cwd ? String(body.cwd) : null;
        if (!cmd) return json({ ok: false, error: "body.cmd required" }, 400);
        if (cmd.length > MAX_CMD) return json({ ok: false, error: "cmd too long (max " + MAX_CMD + ")" }, 413);
        await this.ensureStarted();
        const cdPrefix = cwd ? "cd " + JSON.stringify(cwd) + " && " : "";
        const out = await this.run(["bash", "-c", cdPrefix + cmd]);
        await logEvent(this.env, "container.sh", cmd.slice(0, 200), { exitCode: out.exitCode }, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, result: out });
      }

      // /exec — python3 -c <code>
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

      // /node — node -e <code>
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

      // /pip — pip install <packages>
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

      // /npm — npm install <packages> in /workspace
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

      // /git/clone — clone a repo into /workspace/<name>
      if (path === "/git/clone") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const repoUrl = String(body.url || "").trim();
        const branch = body.branch ? String(body.branch) : null;
        const depth = parseInt(body.depth, 10) || 1;
        const name = body.name
          ? safeRel(String(body.name))
          : repoUrl.split("/").pop().replace(/\.git$/, "");
        if (!repoUrl) return json({ ok: false, error: "url required" }, 400);
        if (!name) return json({ ok: false, error: "invalid repo name" }, 400);
        await this.ensureStarted();
        const checkOut = await this.run(["bash", "-c",
          "[ -d /workspace/" + name + "/.git ] && echo EXISTS || echo MISSING"
        ]);
        let out;
        if (checkOut.stdout.trim() === "EXISTS") {
          out = await this.run(["bash", "-c",
            "cd /workspace/" + name + " && git fetch --depth=" + depth + " && git reset --hard origin/HEAD 2>&1"
          ]);
        } else {
          const branchFlag = branch ? "--branch " + branch + " " : "";
          const depthFlag = depth > 0 ? "--depth=" + depth + " " : "";
          out = await this.run(["bash", "-c",
            "git clone " + depthFlag + branchFlag + JSON.stringify(repoUrl) + " /workspace/" + name + " 2>&1"
          ]);
        }
        await logEvent(this.env, "container.git_clone", repoUrl, { exitCode: out.exitCode, name }, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, url: repoUrl, name, path: "/workspace/" + name, result: out });
      }

      // /git/op — git <op> in /workspace/<repo>
      if (path === "/git/op") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const repo = safeRel(String(body.repo || ""));
        const op = String(body.op || "status");
        const args = String(body.args || "");
        if (!repo) return json({ ok: false, error: "repo required" }, 400);
        const allowed = ["status","log","diff","show","branch","add","commit","push","pull","checkout","reset","fetch","blame","stash"];
        if (!allowed.includes(op)) return json({ ok: false, error: "op not allowed: " + op }, 400);
        await this.ensureStarted();
        const out = await this.run(["bash", "-c",
          "cd /workspace/" + repo + " && git " + op + " " + args + " 2>&1"
        ]);
        return json({ ok: out.exitCode === 0, repo, op, result: out });
      }

      // /workspace/write — write a file
      if (path === "/workspace/write") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const rel = safeRel(body.path);
        if (!rel) return json({ ok: false, error: "body.path required, no .." }, 400);
        const content = typeof body.content === "string" ? body.content : "";
        await this.ensureStarted();
        const b64 = btoa(unescape(encodeURIComponent(content)));
        const pyCode = "import base64,os,pathlib,sys; p=sys.argv[1]; os.makedirs(os.path.dirname(p) or '.', exist_ok=True); pathlib.Path(p).write_bytes(base64.b64decode(sys.argv[2])); print('WROTE', len(base64.b64decode(sys.argv[2])), 'bytes')";
        const out = await this.run(["python3", "-c", pyCode, WORKSPACE + "/" + rel, b64]);
        return json({ ok: out.exitCode === 0, path: rel, bytes: content.length, result: out });
      }

      // /workspace/read — read a file
      if (path === "/workspace/read") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const rel = safeRel(body.path);
        if (!rel) return json({ ok: false, error: "body.path required, no .." }, 400);
        const maxChars = Math.min(parseInt(body.maxChars, 10) || 65536, 131072);
        await this.ensureStarted();
        const pyCode = "import base64,pathlib,sys; p=pathlib.Path(sys.argv[1]); print(base64.b64encode(p.read_bytes()).decode())";
        const out = await this.run(["python3", "-c", pyCode, WORKSPACE + "/" + rel]);
        let content = null;
        if (out.exitCode === 0) {
          try { content = decodeURIComponent(escape(atob(out.stdout.trim()))).slice(0, maxChars); } catch (e) {}
        }
        return json({ ok: out.exitCode === 0, path: rel, content, truncated: content && content.length >= maxChars, result: { exitCode: out.exitCode, stderr: out.stderr } });
      }

      // /workspace/ls — list files
      if (path === "/workspace/ls") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const rel = body.path ? safeRel(String(body.path)) : "";
        const fullPath = rel ? WORKSPACE + "/" + rel : WORKSPACE;
        await this.ensureStarted();
        const out = await this.run(["bash", "-c", "ls -la " + JSON.stringify(fullPath) + " 2>&1"]);
        return json({ ok: out.exitCode === 0, path: fullPath, result: out });
      }

      // /workspace/exec — run cmd in workspace subdir
      if (path === "/workspace/exec") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const rel = body.dir ? safeRel(String(body.dir)) : "";
        const cmd = String(body.cmd || "").trim();
        if (!cmd) return json({ ok: false, error: "body.cmd required" }, 400);
        const cwd = rel ? WORKSPACE + "/" + rel : WORKSPACE;
        await this.ensureStarted();
        const out = await this.run(["bash", "-c", "cd " + JSON.stringify(cwd) + " && " + cmd]);
        await logEvent(this.env, "container.workspace_exec", cmd.slice(0, 200), { exitCode: out.exitCode, dir: rel || "/" }, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, dir: cwd, result: out });
      }

      // /status — container probe
      if (path === "/status") {
        return json({ ok: true, containerRunning: this.ctx.container.running, initialized: this._initialized });
      }

      return json({ ok: false, error: "not found: " + path }, 404);

    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      try { await logEvent(this.env, "container.error", msg, {}, "error"); } catch (le) {}
      return json({ ok: false, error: msg }, 500);
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({
        ok: true,
        worker: "qnfo-containers-pilot",
        version: VERSION,
        capabilities: ["bash", "python3.12", "node22", "npm", "pip", "git", "ripgrep", "workspace-fs", "git-clone", "full-shell"],
      });
    }
    const id = env.SHELL_CONTAINER.idFromName("default");
    const stub = env.SHELL_CONTAINER.get(id);
    return stub.fetch(request);
  },
};
