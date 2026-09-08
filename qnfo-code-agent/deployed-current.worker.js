var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var VERSION = "0.1.0";
var WORKER = "qnfo-code-agent";
var GH_API = "https://api.github.com";
var OWNER = "QNFO";
var MODEL = "kimi-k2.7-code";
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function snippet(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) + "..." : s;
}
__name(snippet, "snippet");
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
  if (!tok) return false;
  if (!env.CODE_AGENT_KEY) return false;
  const a = await sha256hex(tok);
  const b = await sha256hex(env.CODE_AGENT_KEY);
  return a === b;
}
__name(authed, "authed");
function ghHeaders(env) {
  return { "Authorization": "Bearer " + (env.GITHUB_TOKEN || ""), "Accept": "application/vnd.github+json", "User-Agent": "qnfo-code-agent", "X-GitHub-Api-Version": "2022-11-28" };
}
__name(ghHeaders, "ghHeaders");
async function ghGet(env, path) {
  const r = await fetch(GH_API + path, { headers: ghHeaders(env) });
  const t = await r.text();
  let data;
  try {
    data = JSON.parse(t);
  } catch (e) {
    data = t;
  }
  return { status: r.status, data };
}
__name(ghGet, "ghGet");
function b64dec(s) {
  const bin = atob(String(s || "").replace(/\s+/g, ""));
  const bytes = Uint8Array.from(bin, function(c) {
    return c.charCodeAt(0);
  });
  return new TextDecoder().decode(bytes);
}
__name(b64dec, "b64dec");
function b64enc(s) {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(new TextEncoder().encode(s))));
}
__name(b64enc, "b64enc");
async function repoTree(env, body) {
  const repo = String(body && body.repo || "").trim();
  const branch = String(body && body.branch || "main").trim();
  if (!repo) return json({ ok: false, error: "repo required (owner/name within QNFO, e.g. qnfo-workers)" }, 400);
  const ref = await ghGet(env, "/repos/" + OWNER + "/" + repo + "/git/trees/" + branch + "?recursive=1");
  if (ref.status !== 200) return json({ ok: false, status: ref.status, error: ref.data.message || "tree failed" }, 502);
  const tree = (ref.data.tree || []).filter(function(t) {
    return t.type === "blob";
  });
  return json({ ok: true, repo: OWNER + "/" + repo, branch, count: tree.length, files: tree.map(function(t) {
    return t.path;
  }) });
}
__name(repoTree, "repoTree");
async function repoRead(env, body) {
  const repo = String(body && body.repo || "").trim();
  const path = String(body && body.path || "").trim();
  const branch = String(body && body.branch || "main").trim();
  const maxChars = Number(body && body.maxChars) || 12e3;
  if (!repo || !path) return json({ ok: false, error: "repo + path required" }, 400);
  const r = await ghGet(env, "/repos/" + OWNER + "/" + repo + "/contents/" + path + "?ref=" + encodeURIComponent(branch));
  if (r.status !== 200) return json({ ok: false, status: r.status, error: r.data.message || "read failed" }, 502);
  const content = b64dec(r.data.content || "");
  const truncated = content.length > maxChars;
  return json({ ok: true, repo: OWNER + "/" + repo, path, branch, sha: r.data.sha, size: r.data.size, truncated, content: content.slice(0, maxChars) });
}
__name(repoRead, "repoRead");
async function repoEdit(env, body) {
  const repo = String(body && body.repo || "").trim();
  const path = String(body && body.path || "").trim();
  const content = String(body && body.content || "");
  const branch = String(body && body.branch || "codeagent-" + Date.now().toString(36)).trim();
  const commitMsg = String(body && body.commit_message || "qnfo-code-agent: " + path);
  const baseBranch = String(body && body.base_branch || "main").trim();
  const createPr = !!(body && body.create_pr);
  if (!repo || !path) return json({ ok: false, error: "repo + path + content required" }, 400);
  const baseRef = await ghGet(env, "/repos/" + OWNER + "/" + repo + "/git/ref/heads/" + baseBranch);
  if (baseRef.status !== 200) return json({ ok: false, status: baseRef.status, error: baseRef.data.message || "base branch failed" }, 502);
  const baseSha = baseRef.data.object && baseRef.data.object.sha;
  const branchRef = await ghGet(env, "/repos/" + OWNER + "/" + repo + "/git/ref/heads/" + branch);
  if (branchRef.status === 404) {
    const cr = await fetch(GH_API + "/repos/" + OWNER + "/" + repo + "/git/refs", { method: "POST", headers: ghHeaders(env), body: JSON.stringify({ ref: "refs/heads/" + branch, sha: baseSha }) });
    if (cr.status !== 201) return json({ ok: false, status: cr.status, error: "branch create failed" }, 502);
  }
  let cur = await ghGet(env, "/repos/" + OWNER + "/" + repo + "/contents/" + path + "?ref=" + encodeURIComponent(branch));
  let fileSha = cur.status === 200 && cur.data.sha ? cur.data.sha : null;
  const putBody = { message: commitMsg, content: b64enc(content), branch };
  if (fileSha) putBody.sha = fileSha;
  const pu = await fetch(GH_API + "/repos/" + OWNER + "/" + repo + "/contents/" + path, { method: "PUT", headers: ghHeaders(env), body: JSON.stringify(putBody) });
  const puData = await pu.text();
  if (pu.status !== 200 && pu.status !== 201) return json({ ok: false, status: pu.status, error: snippet(puData, 400) }, 502);
  const result = { ok: true, repo: OWNER + "/" + repo, path, branch, commit_message: commitMsg, committed: true };
  if (createPr) {
    const prBody = { title: "qnfo-code-agent: " + path, head: branch, base: baseBranch, body: "Autonomous server-side edit by qnfo-code-agent v" + VERSION + ". Verifier: GitHub Actions CI on this PR." };
    const pr = await fetch(GH_API + "/repos/" + OWNER + "/" + repo + "/pulls", { method: "POST", headers: ghHeaders(env), body: JSON.stringify(prBody) });
    const prData = await pr.json();
    if (pr.status === 201) {
      result.pr = prData.number;
      result.pr_url = prData.html_url;
    } else result.pr_error = snippet(JSON.stringify(prData), 300);
  }
  return json(result);
}
__name(repoEdit, "repoEdit");
async function repoList(env, body) {
  const n = await ghGet(env, "/orgs/" + OWNER + "/repos?per_page=100&type=public");
  const names = n.status === 200 && Array.isArray(n.data) ? n.data.map(function(r) {
    return r.name;
  }) : [];
  return json({ ok: true, org: OWNER, count: names.length, repos: names });
}
__name(repoList, "repoList");
function route(env, req, url) {
  const p = url.pathname;
  if (p === "/health") return json({ status: "ok", worker: WORKER, version: VERSION, model: MODEL, capabilities: ["github-read", "github-edit", "github-pr", "server-side", "autonomous"] });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  return (async function() {
    if (!await authed(env, req)) return json({ error: "unauthorized" }, 401);
    const body = await req.json().catch(function() {
      return {};
    });
    if (p === "/v1/repo/tree") return await repoTree(env, body);
    if (p === "/v1/repo/read") return await repoRead(env, body);
    if (p === "/v1/repo/edit") return await repoEdit(env, body);
    if (p === "/v1/repo/list") return await repoList(env, body);
    return json({ error: "unknown route: " + p }, 404);
  })();
}
__name(route, "route");
var worker_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      return await route(env, req, url);
    } catch (e) {
      return json({ error: "qnfo-code-agent error: " + (e && e.message ? e.message : String(e)) }, 500);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
