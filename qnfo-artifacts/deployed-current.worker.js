/**
 * qnfo-artifacts -- Cloudflare Artifacts control plane + agent workspace provisioner.
 *
 * WHY: Artifacts is "versioned storage that speaks Git". The fleet needs one
 *      server-side control plane that can (a) enumerate/create repos in the qnfo
 *      namespace and (b) mint short-lived scoped Git tokens so an agent, task, or
 *      branch gets an isolated repo it can clone, commit, and push to.
 *
 * CONTRACT
 *   PRE:    env.ARTIFACTS is an Artifacts binding to namespace "qnfo".
 *   POST:   every handler returns JSON; GET /health is 200 while the worker is live.
 *   INVARIANT: no route returns a long-lived token; default TTL 3600s, max 86400s.
 *              Tokens are never logged.
 *
 * ROUTES
 *   GET  /health                          liveness + self-doc
 *   GET  /                                self-doc
 *   GET  /repos?limit&cursor              list repos in the namespace
 *   POST /repos   {name,description,defaultBranch,readOnly}   create a repo
 *   GET  /repos/:name                     repo handle check
 *   GET  /repos/:name/log?limit           commit log
 *   POST /repos/:name/token {scope,ttl}   mint a scoped Git token
 *   POST /workspace {unit,kind}           create ONE isolated repo for an agent/task
 *   GET  /tokens?repo=:name               list token ids (no secrets)
 */

const VERSION = "1.0.0";
const MAX_TTL = 86400;
const DEFAULT_TTL = 3600;
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const CAPABILITIES = [
  "artifacts-binding",
  "artifacts-control-plane",
  "versioned-git-storage",
  "agent-workspace-provisioning",
  "scoped-git-tokens",
  "self-registration",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function fail(message, status = 400, code = "bad_request") {
  return json({ ok: false, error: code, message }, status);
}

function clampTtl(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL;
  return Math.min(Math.floor(n), MAX_TTL);
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (path === "/health") {
      return json({
        status: "ok",
        worker: "qnfo-artifacts",
        version: VERSION,
        namespace: env.ARTIFACTS_NAMESPACE || "qnfo",
        capabilities: CAPABILITIES,
        routes: ["/health", "/", "/repos", "/repos/:name", "/repos/:name/log", "/repos/:name/token", "/workspace", "/tokens"],
        backend: "cloudflare-artifacts",
        auth_model: "control-plane via Cloudflare API token; git ops via scoped repo tokens",
      });
    }

    if (path === "/") {
      return json({ worker: "qnfo-artifacts", version: VERSION, namespace: env.ARTIFACTS_NAMESPACE || "qnfo", capabilities: CAPABILITIES });
    }

    if (!env.ARTIFACTS) return fail("ARTIFACTS binding missing", 501, "binding_missing");

    if (path === "/repos" && method === "GET") {
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 25, 1), 100);
      const cursor = url.searchParams.get("cursor") || undefined;
      try {
        const page = await env.ARTIFACTS.list({ limit, cursor });
        return json({ ok: true, count: page.repos.length, cursor: page.cursor == null ? null : page.cursor, repos: page.repos.map(function (r) { return { name: r.name, status: r.status }; }) });
      } catch (e) { return fail(String((e && e.message) || e), 502, "artifacts_list_failed"); }
    }

    if (path === "/repos" && method === "POST") {
      const body = await readJson(request);
      const name = String(body.name || "");
      if (!NAME_RE.test(name)) return fail("invalid repo name", 400, "invalid_name");
      try {
        const created = await env.ARTIFACTS.create(name, {
          description: body.description ? String(body.description).slice(0, 1024) : undefined,
          readOnly: body.readOnly === true,
          setDefaultBranch: body.defaultBranch ? String(body.defaultBranch) : "main",
        });
        return json({ ok: true, repo: { name: created.name, defaultBranch: created.defaultBranch, remote: created.remote }, token: created.token }, 201);
      } catch (e) { return fail(String((e && e.message) || e), 409, "artifacts_create_failed"); }
    }

    const repoMatch = path.match(/^\/repos\/([^/]+)(\/log|\/token)?$/);
    if (repoMatch) {
      const name = decodeURIComponent(repoMatch[1]);
      const sub = repoMatch[2] || "";
      let repo;
      try { repo = await env.ARTIFACTS.get(name); }
      catch (e) { return fail("repo '" + name + "' not found or not ready", 404, "repo_not_found"); }

      if (!sub && method === "GET") return json({ ok: true, repo: { name: name, handle: true } });

      if (sub === "/log" && method === "GET") {
        try {
          const log = await repo.log({ limit: Math.min(Number(url.searchParams.get("limit")) || 20, 100) });
          return json({ ok: true, repo: name, commits: log });
        } catch (e) { return fail(String((e && e.message) || e), 502, "log_failed"); }
      }

      if (sub === "/token" && method === "POST") {
        const body = await readJson(request);
        const scope = body.scope === "read" ? "read" : "write";
        const ttl = clampTtl(body.ttl);
        try {
          const token = await repo.createToken(scope, ttl);
          return json({ ok: true, repo: name, scope: scope, ttl: ttl, token: token });
        } catch (e) { return fail(String((e && e.message) || e), 502, "token_failed"); }
      }

      return fail("method not allowed", 405, "method_not_allowed");
    }

    if (path === "/workspace" && method === "POST") {
      const body = await readJson(request);
      const rawUnit = String(body.unit || "").trim();
      if (!rawUnit) return fail("unit required", 400, "missing_unit");
      const kind = ["agent", "task", "branch", "user"].indexOf(body.kind) >= 0 ? body.kind : "agent";
      const slug = rawUnit.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
      if (!slug) return fail("unit produced an empty slug", 400, "invalid_unit");
      const name = kind + "-" + slug;
      try {
        const created = await env.ARTIFACTS.create(name, {
          description: "Isolated Artifacts workspace for " + kind + ":" + rawUnit,
          readOnly: false,
          setDefaultBranch: "main",
        });
        return json({ ok: true, workspace: { kind: kind, unit: rawUnit, repo: created.name, defaultBranch: created.defaultBranch, remote: created.remote }, token: created.token }, 201);
      } catch (e) { return fail(String((e && e.message) || e), 409, "workspace_create_failed"); }
    }

    if (path === "/tokens" && method === "GET") {
      const name = url.searchParams.get("repo");
      if (!name) return fail("repo query param required", 400, "missing_repo");
      try {
        const repo = await env.ARTIFACTS.get(name);
        const tokens = await repo.listTokens();
        return json({ ok: true, repo: name, tokens: tokens });
      } catch (e) { return fail(String((e && e.message) || e), 502, "list_tokens_failed"); }
    }

    return fail("not found", 404, "not_found");
  },
};
