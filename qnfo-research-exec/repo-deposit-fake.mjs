// Shared test double for repo-deposit.test.mjs and repo-deposit-wiring.test.mjs: an in-memory GitHub Git Data API (refs, commits, trees,
// blobs, contents, compare) with fault injection. Not a suite: the name carries no .test.mjs.
import { createHash } from "node:crypto";
const sha1 = (b) => createHash("sha1").update(b).digest("hex");
export const blobId = (s) => { const b = Buffer.from(s, "utf8"); return sha1(Buffer.concat([Buffer.from("blob " + b.length + "\0"), b])); };

export class FakeGitHub {
  constructor(files = {}, repo = "QNFO/qnfo-research") {
    this.repo = repo; this.blobs = new Map(); this.trees = new Map(); this.commits = new Map(); this.requests = []; this.faults = [];
    const flat = new Map();
    for (const [p, c] of Object.entries(files)) flat.set(p, this.putBlob(c));
    this.head = this.putCommit(this.putTree(flat), [], "init");
    this.commitCount = 0;
  }
  putBlob(content) { const id = blobId(content); this.blobs.set(id, content); return id; }
  putTree(flat) { const id = sha1(JSON.stringify([...flat].sort())); this.trees.set(id, flat); return id; }
  putCommit(tree, parents, message) { const id = sha1(JSON.stringify([tree, parents, message, this.commits.size])); this.commits.set(id, { tree, parents, message }); return id; }
  files(ref) { const flat = this.trees.get(this.commits.get(ref || this.head).tree), out = {}; for (const [p, b] of flat) out[p] = this.blobs.get(b); return out; }
  isAncestor(a, b) { if (a === b) return true; const c = this.commits.get(b); return !!c && c.parents.some((p) => this.isAncestor(a, p)); }
  // a second writer commits straight to the branch
  foreignCommit(files) { const flat = new Map(this.trees.get(this.commits.get(this.head).tree)); for (const [p, c] of Object.entries(files)) flat.set(p, this.putBlob(c)); this.head = this.putCommit(this.putTree(flat), [this.head], "foreign"); }
  fault(f) { this.faults.push(f); }
  take(method, path) { const i = this.faults.findIndex((f) => f.method === method && f.match.test(path) && (f.times = (f.times === undefined ? 1 : f.times)) > 0); if (i < 0) return null; const f = this.faults[i]; f.times--; return f; }
  async fetch(url, init = {}) {
    const u = new URL(url), method = init.method || "GET", path = u.pathname; this.requests.push(method + " " + path + u.search);
    const reply = (status, body, raw) => ({ status, headers: { get: () => null }, text: async () => (raw ? body : JSON.stringify(body)) });
    const base = "/repos/" + this.repo;
    const f = this.take(method, path);
    if (f && f.before) f.before(this);
    if (f && f.status) return reply(f.status, { message: "injected" });
    let m;
    if (method === "GET" && path === base + "/git/ref/heads/main") return reply(200, { object: { sha: this.head } });
    if (method === "GET" && (m = /\/git\/commits\/(\w+)$/.exec(path))) { const c = this.commits.get(m[1]); return c ? reply(200, { sha: m[1], tree: { sha: c.tree } }) : reply(404, {}); }
    if (method === "GET" && (m = /\/git\/trees\/(\w+)$/.exec(path))) {
      const flat = this.trees.get(m[1]); if (!flat) return reply(404, {});
      const top = new Map();
      for (const [p, b] of flat) { const i = p.indexOf("/"); if (i < 0) top.set(p, { path: p, type: "blob", sha: b }); else { const d = p.slice(0, i); if (!top.has(d)) { const sub = new Map(); for (const [q, bb] of flat) if (q.startsWith(d + "/")) sub.set(q.slice(d.length + 1), bb); top.set(d, { path: d, type: "tree", sha: this.putTree(sub) }); } } }
      return reply(200, { sha: m[1], tree: [...top.values()] });
    }
    if (method === "POST" && path === base + "/git/blobs") {
      const body = JSON.parse(init.body), text = Buffer.from(body.content, "base64").toString("utf8"), id = this.putBlob(text);
      return reply(201, { sha: f && f.lie ? "0".repeat(40) : id });
    }
    if (method === "POST" && path === base + "/git/trees") {
      const body = JSON.parse(init.body), flat = new Map(this.trees.get(body.base_tree));
      for (const e of body.tree) { if (e.sha === null) flat.delete(e.path); else flat.set(e.path, e.sha); }
      return reply(201, { sha: this.putTree(flat) });
    }
    if (method === "POST" && path === base + "/git/commits") { const b = JSON.parse(init.body); return reply(201, { sha: this.putCommit(b.tree, b.parents, b.message) }); }
    if (method === "PATCH" && path === base + "/git/refs/heads/main") {
      const b = JSON.parse(init.body);
      if (!this.isAncestor(this.head, b.sha)) return reply(422, { message: "Update is not a fast forward" });
      this.head = b.sha; this.commitCount++;
      if (f && f.lose) throw new Error("connection reset after the server applied the update");
      return reply(200, { object: { sha: b.sha } });
    }
    if (method === "POST" && /\/actions\/workflows\/[\w.-]+\/dispatches$/.test(path)) { (this.dispatches = this.dispatches || []).push(path.split("/").slice(-2)[0]); return reply(204, "", true); }
    if (method === "GET" && (m = /\/compare\/(\w+)\.\.\.(\w+)$/.exec(path))) { const a = m[1] === "main" ? this.head : m[1], b = m[2] === "main" ? this.head : m[2]; return reply(200, { status: this.isAncestor(a, b) ? (a === b ? "identical" : "ahead") : "diverged" }); }
    if (method === "GET" && path.startsWith(base + "/contents/")) {
      const file = decodeURIComponent(path.slice((base + "/contents/").length)), ref = u.searchParams.get("ref");
      const sha = ref === "main" ? this.head : ref;
      if (!this.commits.has(sha)) return reply(404, {});
      const c = this.files(sha)[file];
      return c === undefined ? reply(404, { message: "Not Found" }) : reply(200, c, true);
    }
    return reply(500, { message: "unhandled " + method + " " + path });
  }
}

// Routes /repos/<owner>/<repo>/... to one FakeGitHub per repository, so a test can hold the consolidated and the legacy repository.
export class FakeHub {
  constructor(repos) { this.repos = repos; }
  async fetch(url, init) {
    const m = /^\/repos\/([^/]+)\/([^/]+)\//.exec(new URL(url).pathname);
    const gh = m && this.repos[m[1] + "/" + m[2]];
    if (!gh) return { status: 404, headers: { get: () => null }, text: async () => "{}" };
    return gh.fetch(url, init);
  }
}
