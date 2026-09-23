/**
 * qnfo-artifact-agent -- an Agents-SDK agent that owns Cloudflare Artifacts workspaces.
 *
 * WHY: Cloudflare Agents give each session a durable identity, SQL storage, routing and
 *      recoverable execution; Cloudflare Artifacts gives versioned file trees behind a
 *      Git interface. Composed, an agent can hand each unit of work its OWN repo, keep a
 *      durable ledger of what it created, and mint short-lived scoped Git tokens so the
 *      work can be handed off to any Git-aware tool -- the documented
 *      "one repo per agent, user, branch, or task" pattern.
 *
 * CONTRACT
 *   PRE:    env.ARTIFACTS is an Artifacts binding to namespace "qnfo"; the ArtifactAgent
 *           Durable Object class is migrated (new_sqlite_classes).
 *   POST:   every route returns JSON; the agent's ledger is durable across eviction.
 *   INVARIANT: the ledger never stores token plaintext; tokens are returned to the caller
 *              once and never persisted by the agent.
 *
 * ROUTES (agent-scoped, under /agents/ArtifactAgent/:session)
 *   GET  /health                 liveness + session identity
 *   GET  /ledger                 durable workspace ledger for this session
 *   GET  /repos                  repos in the qnfo namespace (live)
 *   POST /provision {unit,kind}  create an isolated repo + record it in the ledger
 *   POST /token {repo,scope,ttl} mint a scoped Git token (ttl <= 86400)
 *   GET  /log?repo=:name         commit log for a repo
 */

const VERSION = "1.0.0";
const MAX_TTL = 86400;
const DEFAULT_TTL = 3600;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export class ArtifactAgent extends Agent {
  initialState = { workspaces: [], createdAt: null };

  async onStart() {
    if (!this.state.createdAt) this.setState({ ...this.state, createdAt: new Date().toISOString() });
  }

  async onRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const method = request.method.toUpperCase();
    const tail = (s) => path.endsWith(s);

    if (tail("/health")) {
      return json({
        status: "ok",
        worker: "qnfo-artifact-agent",
        version: VERSION,
        agent: "ArtifactAgent",
        session: this.name,
        namespace: this.env.ARTIFACTS_NAMESPACE || "qnfo",
        workspaces: (this.state.workspaces || []).length,
        capabilities: ["agents-sdk", "durable-agent-session", "agent-workspace-provisioning", "scoped-git-tokens"],
      });
    }

    if (tail("/ledger") && method === "GET") {
      return json({ ok: true, session: this.name, ledger: this.state });
    }

    if (tail("/repos") && method === "GET") {
      const page = await this.env.ARTIFACTS.list({ limit: 50 });
      return json({ ok: true, count: page.repos.length, repos: page.repos.map((r) => ({ name: r.name, status: r.status })) });
    }

    if (tail("/provision") && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (e) { body = {}; }
      const rawUnit = String(body.unit || "").trim();
      if (!rawUnit) return json({ ok: false, error: "unit required" }, 400);
      const kind = ["agent", "task", "branch", "user"].indexOf(body.kind) >= 0 ? body.kind : "task";
      const slug = rawUnit.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
      if (!slug) return json({ ok: false, error: "unit produced an empty slug" }, 400);
      const repoName = kind + "-" + slug;
      try {
        const created = await this.env.ARTIFACTS.create(repoName, {
          description: "Session " + this.name + " workspace for " + kind + ":" + rawUnit,
          readOnly: false,
          setDefaultBranch: "main",
        });
        const entry = { repo: created.name, kind, unit: rawUnit, remote: created.remote, createdAt: new Date().toISOString() };
        this.setState({ ...this.state, workspaces: [...(this.state.workspaces || []), entry] });
        return json({ ok: true, session: this.name, workspace: entry, token: created.token }, 201);
      } catch (e) {
        return json({ ok: false, error: String((e && e.message) || e) }, 409);
      }
    }

    if (tail("/token") && method === "POST") {
      let body = {};
      try { body = await request.json(); } catch (e) { body = {}; }
      if (!body.repo) return json({ ok: false, error: "repo required" }, 400);
      const scope = body.scope === "read" ? "read" : "write";
      const n = Number(body.ttl);
      const ttl = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_TTL) : DEFAULT_TTL;
      try {
        const repo = await this.env.ARTIFACTS.get(String(body.repo));
        const token = await repo.createToken(scope, ttl);
        return json({ ok: true, repo: body.repo, scope, ttl, token });
      } catch (e) {
        return json({ ok: false, error: String((e && e.message) || e) }, 502);
      }
    }

    if (tail("/log") && method === "GET") {
      const name = url.searchParams.get("repo");
      if (!name) return json({ ok: false, error: "repo query param required" }, 400);
      try {
        const repo = await this.env.ARTIFACTS.get(name);
        const log = await repo.log({ limit: 20 });
        return json({ ok: true, repo: name, commits: log });
      } catch (e) {
        return json({ ok: false, error: String((e && e.message) || e) }, 502);
      }
    }

    return json({ ok: false, error: "not_found", routes: ["/health", "/ledger", "/repos", "/provision", "/token", "/log"] }, 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ status: "ok", worker: "qnfo-artifact-agent", version: VERSION, agent: "ArtifactAgent", namespace: env.ARTIFACTS_NAMESPACE || "qnfo" });
    }
    if (url.pathname === "/" ) {
      return json({ worker: "qnfo-artifact-agent", version: VERSION, agent: "ArtifactAgent", docs: "GET /agents/ArtifactAgent/:session/{health|ledger|repos|log}, POST /agents/ArtifactAgent/:session/{provision|token}" });
    }
    const routed = await routeAgentRequest(request, env);
    if (routed) return routed;
    return json({ ok: false, error: "not_found" }, 404);
  },
};
