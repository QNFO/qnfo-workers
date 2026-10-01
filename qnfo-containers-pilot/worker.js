var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
// ENOSPC-CACHE-1: apt cache + .deb archives reclaimed on cold start (issue #1445)
// CLONE-EGRESS-TIMEOUT-FALLBACK-1 (2026-09-29): /git/clone previously ran a bare
// `git clone` with no wall-clock bound, no --single-branch and no fallback. On the
// measured slow GitHub egress path the child process outlived the caller's 180s
// budget, so callers recorded a container timeout instead of a clone result
// (git_clone_exec 24h failure rate 18/40 = 45%, issues #1462 / #1465). Fix:
//   (a) bound every git attempt with `timeout 150` so a stall returns a clean
//       non-zero exit well inside the caller budget instead of hanging;
//   (b) abort stalled transfers via -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60
//       and cut round trips with --single-branch --no-tags + protocol.version=2;
//   (c) fall back to a single-request codeload tarball when git still fails.
// LIMITATION (stated, not hidden): the tarball fallback produces NO .git directory,
// so it is returned with method:"tarball", git:false and is only usable for
// read/build workloads, not for git_op on that checkout.
var VERSION = "1.0.10-props-caller";
var RATE_PER_MINUTE = 60;
var RATE_PER_HOUR = 600;
var MAX_INFLIGHT = 8;
var MAX_CMD = 65536;
var MAX_OUT = 131072;
var WORKSPACE = "/workspace";
function json(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
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
__name(authorized, "authorized");
function safeRel(p) {
  const rel = String(p || "").replace(/^\/+/g, "");
  if (!rel) return null;
  if (rel.split("/").indexOf("..") >= 0) return null;
  if (rel.indexOf("\\") >= 0) return null;
  return rel;
}
__name(safeRel, "safeRel");
async function logEvent(env, kind, text, meta, status) {
  if (!env || !env.AUDIT) return;
  try {
    const id = crypto.randomUUID();
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    await env.AUDIT.prepare(
      "INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      id,
      ts,
      String(kind).slice(0, 200),
      String(text || "").slice(0, 2e3),
      meta ? JSON.stringify(meta).slice(0, 4e3) : null,
      "qnfo-containers-pilot",
      status || "ok"
    ).run();
  } catch (e) {
  }
}
__name(logEvent, "logEvent");
class ShellContainer {
  static {
    __name(this, "ShellContainer");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this._initialized = false;
    this._starting = null;
  }
  async ensureStarted() {
    if (!this.ctx.container) { throw new Error("CONTAINER-CONFIG-MISSING-1: ctx.container is undefined - the [[containers]] block is not attached to this deployment (issue #1485). A /content PUT drops it; redeploy through the metadata-preserving path."); }
    if (this.ctx.container.running) return;
    if (this._starting) return this._starting;
    this._starting = this._doStart().finally(() => {
      this._starting = null;
    });
    return this._starting;
  }
  async _doStart() {
    if (!this.ctx.container) { throw new Error("CONTAINER-CONFIG-MISSING-1: ctx.container is undefined - the [[containers]] block is not attached to this deployment (issue #1485). A /content PUT drops it; redeploy through the metadata-preserving path."); }
    if (this.ctx.container.running) return;
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.ctx.container.start({
          entrypoint: ["bash", "-c", "mkdir -p /workspace && sleep infinity"],
          enableInternet: true
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (this.ctx.container.running) {
          lastErr = null;
          break;
        }
        await new Promise((r) => setTimeout(r, 750));
      }
    }
    if (lastErr) throw lastErr;
    await this.run([
      "bash",
      "-c",
      "DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends git curl ripgrep 2>&1 | tail -3; apt-get clean >/dev/null 2>&1 || true; rm -rf /var/cache/apt/archives/*.deb >/dev/null 2>&1 || true;  git config --global user.email ops@qnfo.org; git config --global user.name 'QNFO ops'; echo INIT_DONE"
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
  // PILOT-RATE-LIMIT-1 (2026-10-01, charter H0 "rate limits on qnfo-containers-pilot"): every command path
  // ran unbounded, so one runaway agent loop could hold the container busy and run up container time. All
  // traffic reaches the single "default" instance of this Durable Object, so an in-memory log here is a
  // fleet-wide limit. Measured over 30 days (cloud_ops_events container.*): peak 38 requests in one minute,
  // peak 548 in one hour (the #1485 error storm). The defaults sit above both, and overflow returns 429
  // with retry_after_s instead of queueing more work.
  _limits() {
    const n = (v, d) => {
      const x = parseInt(v, 10);
      return Number.isFinite(x) && x > 0 ? x : d;
    };
    return { per_minute: n(this.env.PILOT_RPM, RATE_PER_MINUTE), per_hour: n(this.env.PILOT_RPH, RATE_PER_HOUR), inflight: n(this.env.PILOT_MAX_INFLIGHT, MAX_INFLIGHT) };
  }
  _admit() {
    const lim = this._limits();
    const now = Date.now();
    if (!this._log) this._log = [];
    if (!this._inflight) this._inflight = 0;
    while (this._log.length && now - this._log[0] > 36e5) this._log.shift();
    let lastMin = 0;
    for (let i = this._log.length - 1; i >= 0 && now - this._log[i] <= 6e4; i--) lastMin++;
    let reason = null;
    let retry = 1;
    if (this._inflight >= lim.inflight) reason = "inflight " + this._inflight + "/" + lim.inflight;
    else if (lastMin >= lim.per_minute) {
      reason = "per_minute " + lastMin + "/" + lim.per_minute;
      retry = Math.ceil((this._log[this._log.length - lastMin] + 6e4 - now) / 1e3);
    } else if (this._log.length >= lim.per_hour) {
      reason = "per_hour " + this._log.length + "/" + lim.per_hour;
      retry = Math.ceil((this._log[0] + 36e5 - now) / 1e3);
    }
    if (!reason) {
      this._log.push(now);
      this._inflight++;
      return null;
    }
    // One audit row per minute at most, so a refused flood cannot become a D1 write flood.
    if (!this._lastLimitLog || now - this._lastLimitLog > 6e4) {
      this._lastLimitLog = now;
      this.ctx.waitUntil(logEvent(this.env, "container.ratelimited", reason, lim, "error"));
    }
    return new Response(JSON.stringify({ ok: false, error: "PILOT-RATE-LIMIT-1: " + reason, retry_after_s: Math.max(1, retry), limits: lim }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", "retry-after": String(Math.max(1, retry)) }
    });
  }
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (!authorized(request, this.env) || path === "/status") return this._route(request);
    const refused = this._admit();
    if (refused) return refused;
    try {
      return await this._route(request);
    } finally {
      this._inflight = Math.max(0, this._inflight - 1);
    }
  }
  async _route(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!authorized(request, this.env)) {
      return json({ ok: false, error: "unauthorized (PILOT_TOKEN required)" }, 401);
    }
    try {
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
        const b64 = btoa(unescape(encodeURIComponent(code)));
        const out = await this.run(["bash", "-c", "cd " + JSON.stringify(cwd) + " && printf %s " + JSON.stringify(b64) + " | base64 -d | node -"]);
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
        if (!repoUrl) return json({ ok: false, error: "url required" }, 400);
        if (!name) return json({ ok: false, error: "invalid repo name" }, 400);
        await this.ensureStarted();
        const checkOut = await this.run([
          "bash",
          "-c",
          "[ -d /workspace/" + name + "/.git ] && echo EXISTS || echo MISSING"
        ]);
        const gitOpts = "-c http.lowSpeedLimit=1000 -c http.lowSpeedTime=60 -c protocol.version=2";
        let out;
        let method = "git";
        if (checkOut.stdout.trim() === "EXISTS") {
          out = await this.run([
            "bash",
            "-c",
            "cd /workspace/" + name + " && timeout 150 git " + gitOpts + " fetch --depth=" + depth + " 2>&1 && git reset --hard origin/HEAD 2>&1"
          ]);
        } else {
          const branchFlag = branch ? "--branch " + branch + " " : "";
          const depthFlag = depth > 0 ? "--depth=" + depth + " --single-branch --no-tags " : "";
          out = await this.run([
            "bash",
            "-c",
            "timeout 150 git " + gitOpts + " clone " + depthFlag + branchFlag + JSON.stringify(repoUrl) + " /workspace/" + name + " 2>&1"
          ]);
        }
        if (out.exitCode !== 0) {
          const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/?#]+)/);
          if (m) {
            const slug = m[1] + "/" + m[2].replace(/\.git$/, "");
            const ref = branch || "main";
            const fb = await this.run([
              "bash",
              "-c",
              "rm -rf /workspace/" + name + " && mkdir -p /workspace/" + name + " && curl -sSL --max-time 150 " + JSON.stringify("https://codeload.github.com/" + slug + "/tar.gz/refs/heads/" + ref) + " | tar -xz -C /workspace/" + name + " --strip-components=1 2>&1 && echo TARBALL_OK"
            ]);
            if (fb.exitCode === 0 && fb.stdout.indexOf("TARBALL_OK") >= 0) {
              await logEvent(this.env, "container.git_clone", repoUrl, { exitCode: 0, name, method: "tarball" }, "ok");
              return json({ ok: true, url: repoUrl, name, path: "/workspace/" + name, method: "tarball", git: false, result: fb });
            }
            out = fb;
            method = "tarball";
          }
        }
        await logEvent(this.env, "container.git_clone", repoUrl, { exitCode: out.exitCode, name, method }, out.exitCode === 0 ? "ok" : "error");
        return json({ ok: out.exitCode === 0, url: repoUrl, name, path: "/workspace/" + name, method, git: out.exitCode === 0 && method === "git", result: out });
      }
      if (path === "/git/op") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const repo = safeRel(String(body.repo || ""));
        const op = String(body.op || "status");
        const args = String(body.args || "");
        if (!repo) return json({ ok: false, error: "repo required" }, 400);
        const allowed = ["status", "log", "diff", "show", "branch", "add", "commit", "push", "pull", "checkout", "reset", "fetch", "blame", "stash"];
        if (!allowed.includes(op)) return json({ ok: false, error: "op not allowed: " + op }, 400);
        await this.ensureStarted();
        const out = await this.run([
          "bash",
          "-c",
          "cd /workspace/" + repo + " && git " + op + " " + args + " 2>&1"
        ]);
        return json({ ok: out.exitCode === 0, repo, op, result: out });
      }
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
          try {
            content = decodeURIComponent(escape(atob(out.stdout.trim()))).slice(0, maxChars);
          } catch (e) {
          }
        }
        return json({ ok: out.exitCode === 0, path: rel, content, truncated: content && content.length >= maxChars, result: { exitCode: out.exitCode, stderr: out.stderr } });
      }
      if (path === "/workspace/ls") {
        if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
        const body = await request.json().catch(() => ({}));
        const rel = body.path ? safeRel(String(body.path)) : "";
        const fullPath = rel ? WORKSPACE + "/" + rel : WORKSPACE;
        await this.ensureStarted();
        const out = await this.run(["bash", "-c", "ls -la " + JSON.stringify(fullPath) + " 2>&1"]);
        return json({ ok: out.exitCode === 0, path: fullPath, result: out });
      }
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
      if (path === "/status") {
        return json({ ok: true, containerRunning: this.ctx.container.running, initialized: this._initialized });
      }
      return json({ ok: false, error: "not found: " + path }, 404);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      try {
        await logEvent(this.env, "container.error", msg, {}, "error");
      } catch (le) {
      }
      return json({ ok: false, error: msg }, 500);
    }
  }
};
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // PILOT-PROPS-CALLER-1 (2026-10-01): internal workers authenticate by their service binding's ctx.props.caller,
    // which only someone with deploy rights on the CALLER can set (the qnfo-ai INTERNAL-CALLER-PROPS-1 model). Such a
    // caller on the internal hostname gets the bearer injected here, so it needs no copy of PILOT_TOKEN. Before this,
    // qnfo-research-exec called the public hostname with a token it may not hold; since PILOT-PUBLIC-EXEC-CLOSED-1
    // every one of its verification runs got 403. Public requests never carry props.
    try {
      const caller = ctx && ctx.props && typeof ctx.props.caller === "string" ? ctx.props.caller : "";
      if (/^qnfo-[a-z0-9-]{1,60}$/.test(caller) && url.hostname === "containers-pilot.internal" && env.PILOT_TOKEN) {
        const h = new Headers(request.headers);
        h.set("Authorization", "Bearer " + env.PILOT_TOKEN);
        h.set("x-pilot-caller", caller);
        request = new Request(request, { headers: h });
      }
    } catch (e) {
    }
    if (url.pathname === "/health") {
      return json({
        ok: true,
        worker: "qnfo-containers-pilot",
        version: VERSION,
        capabilities: ["bash", "python3.12", "node22", "npm", "pip", "git", "ripgrep", "workspace-fs", "git-clone", "full-shell"],
        limitations: ["command paths only via an internal service binding (qnfo-ops bearer, or a qnfo-* caller authenticated by binding props)", "PILOT-RATE-LIMIT-1: 429 above the limits below", "one shared container instance", "stdout/stderr capped at " + MAX_OUT + " bytes"],
        limits: { per_minute: RATE_PER_MINUTE, per_hour: RATE_PER_HOUR, inflight: MAX_INFLIGHT },
        public_exec: false
      });
    }
    // PILOT-PUBLIC-EXEC-CLOSED-1 (2026-10-01, issue 1677): the full shell was reachable from the
    // internet on *.workers.dev behind one static PILOT_TOKEN. The only command caller is qnfo-ops,
    // which uses the CONTAINERS_PILOT service binding with host containers-pilot.internal; CI probes
    // use only /health (above) and the token-gated /status. A public request always carries the
    // routed hostname (Cloudflare routes on Host, so it cannot claim the internal one), so refuse
    // every other path from a public hostname. A leaked token no longer yields a shell.
    if (url.hostname !== "containers-pilot.internal" && url.pathname !== "/status") {
      return json({ ok: false, error: "forbidden: command paths are reachable only via the qnfo-ops service binding" }, 403);
    }
    const id = env.SHELL_CONTAINER.idFromName("default");
    const stub = env.SHELL_CONTAINER.get(id);
    // PILOT-FETCH-GUARD-1 (2026-09-30): worker_default.fetch had NO try/catch, so any throw
    // from the Durable Object stub (DO momentarily unavailable, idFromName/DO binding
    // transient) surfaced as an uncaught Worker exception = Cloudflare `scriptThrewException`
    // (37 in 24h). Convert it into a structured 500 so callers get a real error body and the
    // invocation is not counted as an uncaught throw.
    try {
      return await stub.fetch(request);
    } catch (e) {
      return json({ ok: false, error: "PILOT-DO-DISPATCH-1: " + String(e && e.message || e) }, 500);
    }
  }
};
export { ShellContainer };
export default worker_default;
//# sourceMappingURL=worker.js.map
