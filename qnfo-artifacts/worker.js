/**
 * qnfo-artifacts -- Cloudflare Artifacts control plane + agent workspace provisioner.
 *
 * WHY: Artifacts is "versioned storage that speaks Git". The fleet needs one
 *      server-side control plane that can (a) enumerate/create repos in the qnfo
 *      namespace and (b) mint short-lived scoped Git tokens so an agent, task, or
 *      branch gets an isolated repo it can clone, commit, and push to.
 *
 * CONTRACT
 *   PRE:    env.ARTIFACTS is an Artifacts binding to namespace "qnfo";
 *           env.ARTIFACTS_TOKEN is a Worker secret.
 *   POST:   every handler returns JSON; GET /health is 200 while the worker is live.
 *   INVARIANT:
 *     I1 FAIL-CLOSED AUTH -- if ARTIFACTS_TOKEN is unset every non-health route
 *        returns 503; it never degrades to open. Missing/incorrect bearer -> 401.
 *     I2 TOKEN TTL -- no route returns a long-lived Git token; default 3600s,
 *        ceiling 86400s. Token plaintext is returned once and never stored.
 *     I3 HEAD TRUTH -- Artifacts beta never populates `last_push_at`, so repo
 *        freshness is read from the commit log (GET /repos/:name/head).
 *
 * ROUTES (all except /health and / require `Authorization: Bearer <ARTIFACTS_TOKEN>`)
 *   GET  /health                          liveness + self-doc (OPEN)
 *   GET  /                                self-doc (OPEN)
 *   GET  /probe                           run the Artifacts re-probe now
 *   GET  /probes?limit                    recent probe rows (beta re-falsification)
 *   GET  /repos?limit&cursor              list repos in the namespace
 *   POST /repos   {name,description,defaultBranch,readOnly}   create a repo
 *   GET  /repos/:name                     repo handle check
 *   GET  /repos/:name/head                authoritative head commit (log-derived)
 *   GET  /repos/:name/log?limit           commit log
 *   POST /repos/:name/token {scope,ttl}   mint a scoped Git token
 *   POST /workspace {unit,kind}           create ONE isolated repo for an agent/task
 *   GET  /tokens?repo=:name               list token ids (no secrets)
 */

const VERSION = "1.1.0";
const MAX_TTL = 86400;
const DEFAULT_TTL = 3600;
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const PROBE_CRON = "17 */6 * * *";

const CAPABILITIES = [
  "artifacts-binding",
  "artifacts-control-plane",
  "versioned-git-storage",
  "agent-workspace-provisioning",
  "scoped-git-tokens",
  "bearer-auth-fail-closed",
  "beta-access-reprobe",
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

/** Constant-time string compare so the gate does not leak length/prefix timing. */
function safeEqual(a, b) {
  const A = String(a == null ? "" : a);
  const B = String(b == null ? "" : b);
  if (A.length !== B.length) return false;
  let d = 0;
  for (let i = 0; i < A.length; i++) d |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return d === 0;
}

function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

/** I1: returns "ok" | "denied" | "unconfigured" -- never coerces a missing secret to open. */
function authState(request, env) {
  if (!env.ARTIFACTS_TOKEN) return "unconfigured";
  return safeEqual(bearer(request), env.ARTIFACTS_TOKEN) ? "ok" : "denied";
}

function clampTtl(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL;
  return Math.min(Math.floor(n), MAX_TTL);
}

async function readJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

/**
 * I3 / item-3: actively re-probe Artifacts so a closed-beta revocation or a REST
 * shape change surfaces as a recorded failure instead of silent rot.
 * Writes one row per run; the table is owned by this worker.
 */
async function probeArtifacts(env) {
  const ts = new Date().toISOString();
  const namespace = env.ARTIFACTS_NAMESPACE || "qnfo";
  let ok = false, repos = 0, detail = "";
  try {
    const page = await env.ARTIFACTS.list({ limit: 100 });
    repos = (page.repos || []).length;
    ok = true;
    detail = "list ok (" + repos + " repos)";
  } catch (e) {
    detail = String((e && e.message) || e).slice(0, 300);
  }
  if (env.AUDIT_DB) {
    try {
      await env.AUDIT_DB.prepare(
        "INSERT INTO artifacts_probes (ts, ok, namespace, repos, detail) VALUES (?1,?2,?3,?4,?5)"
      ).bind(ts, ok ? 1 : 0, namespace, repos, detail).run();
    } catch (e) { /* schema not present; probe result still returned */ }
  }
  return { ok: ok, repoCount: repos, namespace: namespace, detail: detail, ts: ts };
}

async function readProbes(env, limit) {
  if (!env.AUDIT_DB) return { ok: false, error: "AUDIT_DB not bound" };
  try {
    const r = await env.AUDIT_DB.prepare(
      "SELECT ts, ok, namespace, repos, detail FROM artifacts_probes ORDER BY id DESC LIMIT ?1"
    ).bind(Math.min(Math.max(Number(limit) || 20, 1), 100)).all();
    return { ok: true, probes: (r.results || []) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    // OPEN: liveness. Fleet probes + the registry version sweep read this unauthenticated.
    if (path === "/health") {
      return json({
        status: "ok",
        worker: "qnfo-artifacts",
        version: VERSION,
        namespace: env.ARTIFACTS_NAMESPACE || "qnfo",
        capabilities: CAPABILITIES,
        routes: ["/health", "/", "/probe", "/probes", "/repos", "/repos/:name", "/repos/:name/head", "/repos/:name/log", "/repos/:name/token", "/workspace", "/tokens"],
        backend: "cloudflare-artifacts",
        auth: !!env.ARTIFACTS_TOKEN,
        auth_model: "bearer ARTIFACTS_TOKEN on every route except /health and / (fail-closed)",
        triggers: { crons: [PROBE_CRON] },
      });
    }

    if (path === "/") {
      return json({ worker: "qnfo-artifacts", version: VERSION, namespace: env.ARTIFACTS_NAMESPACE || "qnfo", capabilities: CAPABILITIES, auth: !!env.ARTIFACTS_TOKEN });
    }

    // I1: gate everything else.
    const state = authState(request, env);
    if (state === "unconfigured") {
      return json({ ok: false, error: "auth_unconfigured", message: "ARTIFACTS_TOKEN secret is not set; refusing to serve (fail-closed)" }, 503);
    }
    if (state !== "ok") {
      return json({ ok: false, error: "unauthorized", message: "provide Authorization: Bearer <ARTIFACTS_TOKEN>" }, 401);
    }

    if (!env.ARTIFACTS) return fail("ARTIFACTS binding missing", 501, "binding_missing");

    // Re-probe surface (items 3 + DoD-9 re-falsification).
    if (path === "/probe" && method === "GET") return json({ ok: true, probe: await probeArtifacts(env) });
    if (path === "/probes" && method === "GET") return json(await readProbes(env, url.searchParams.get("limit")));

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

    const repoMatch = path.match(/^\/repos\/([^/]+)(\/head|\/log|\/token)?$/);
    if (repoMatch) {
      const name = decodeURIComponent(repoMatch[1]);
      const sub = repoMatch[2] || "";
      let repo;
      try { repo = await env.ARTIFACTS.get(name); }
      catch (e) { return fail("repo '" + name + "' not found or not ready", 404, "repo_not_found"); }

      if (!sub && method === "GET") return json({ ok: true, repo: { name: name, handle: true } });

      // I3: authoritative freshness -- never trusts last_push_at (beta leaves it null).
      if (sub === "/head" && method === "GET") {
        try {
          const log = await repo.log({ limit: 1 });
          const c = Array.isArray(log) && log[0] ? log[0] : null;
          return json({
            ok: true,
            repo: name,
            head: c ? { hash: c.hash, message: c.message, authoredAt: c.authoredAt, committedAt: c.committedAt } : null,
            empty: !c,
            note: "authoritative head read from the commit log; Artifacts beta never populates last_push_at",
          });
        } catch (e) { return fail(String((e && e.message) || e), 502, "head_failed"); }
      }

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

  // Item 3 / DoD-9: recurring re-falsification of the Artifacts beta dependency.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(probeArtifacts(env));
  },
};
