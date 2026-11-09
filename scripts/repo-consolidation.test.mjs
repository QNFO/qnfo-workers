// scripts/repo-consolidation.test.mjs: offline tests for REPO-CONSOLIDATION-1 (scripts/repo-consolidation.mjs). No network.
import assert from "node:assert/strict";
import { run, loadConfig, allowedRepos, copyPlan, withRedirect, redirectLine, makeApi, MARK } from "./repo-consolidation.mjs";

const cfg = {
  date: "2026-11-09", issue: "x/y#3",
  copy: [{ source: "u/src", target: "O/dst", exclude_prefixes: [".github/"], conflict_dir: "imported/src/" }],
  archive: [{ repo: "u/src", home: "O/dst", after_copy: true }, { repo: "O/old", home: "O/new" }, { repo: "O/done", home: "O/new" }],
  transfer: [{ repo: "u/dash", new_owner: "O" }]
};

// A tiny GitHub fake: repos with files, archived flag, readme; records writes.
function fake() {
  const repos = {
    "u/src": { archived: false, files: { "a.md": "A", "skills/s.md": "S", ".github/workflows/x.yml": "W", "same.md": "Z" }, has_pages: false },
    "O/dst": { archived: false, files: { "same.md": "Z", "skills/s.md": "OTHER" }, has_pages: false },
    "O/old": { archived: false, files: { "README.md": "# Old\nbody" }, has_pages: true },
    "O/done": { archived: true, files: {}, has_pages: false },
    "u/dash": { archived: false, files: {}, has_pages: false }
  };
  const sha = (s) => "sha:" + s;
  const writes = [];
  async function f(url, init) {
    const u = new URL(url); const method = (init && init.method) || "GET"; const body = init && init.body ? JSON.parse(init.body) : null;
    const res = (status, j) => ({ status, text: async () => JSON.stringify(j) });
    if (u.host === "site.example") return { status: 200, text: async () => "" };
    const m = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(u.pathname); const name = m[1], rest = m[2] || "";
    if (name === "O/dash" && method === "GET") return repos["O/dash"] ? res(200, { full_name: "O/dash" }) : res(404, { message: "Not Found" });
    const r = repos[name]; if (!r) return res(404, { message: "Not Found" });
    if (!rest && method === "GET") return res(200, { full_name: name, default_branch: "main", archived: r.archived, has_pages: r.has_pages, permissions: { admin: true } });
    if (!rest && method === "PATCH") { writes.push(["PATCH", name, body]); r.archived = !!body.archived; return res(200, {}); }
    if (rest.startsWith("/git/trees/")) return res(200, { tree: Object.keys(r.files).map((p) => ({ path: p, type: "blob", sha: sha(r.files[p]) })) });
    if (rest.startsWith("/git/blobs/")) { const v = decodeURIComponent(rest.split("/").pop()).slice(4); return res(200, { content: Buffer.from(v).toString("base64") }); }
    if (rest === "/readme") return r.files["README.md"] !== undefined ? res(200, { path: "README.md", sha: "r1", content: Buffer.from(r.files["README.md"]).toString("base64") }) : res(404, { message: "Not Found" });
    if (rest.startsWith("/contents/") && method === "PUT") { const p = rest.slice(10).split("/").map(decodeURIComponent).join("/"); writes.push(["PUT", name, p]); r.files[p] = Buffer.from(body.content, "base64").toString("utf8"); return res(201, {}); }
    if (rest === "/pages") return res(200, { status: "built", html_url: "https://site.example/old/" });
    if (rest === "/transfer" && method === "POST") { writes.push(["TRANSFER", name, body.new_owner]); repos["O/dash"] = r; delete repos[name]; return res(202, {}); }
    return res(404, { message: "unhandled " + method + " " + rest });
  }
  return { f, repos, writes };
}

// pure helpers
{
  const src = new Map([["a", "1"], ["b", "2"], [".github/w", "3"], ["c", "4"]]);
  const dst = new Map([["b", "2"], ["c", "X"]]);
  const plan = copyPlan(src, dst, cfg.copy[0]);
  assert.deepEqual(plan.map((p) => p.dest), ["a", "imported/src/c"], "absent copied, differing kept aside, excluded skipped, identical skipped");
  const line = redirectLine(cfg, cfg.archive[1]);
  assert.ok(line.includes(MARK) && line.includes("O/new"));
  assert.equal(withRedirect(line + "\n\nx", line), null, "idempotent");
  assert.equal(withRedirect("# T", line), line + "\n\n# T");
  assert.ok(allowedRepos(cfg).has("O/dash"));
}

// allowlist: a repository outside the config throws before any request
{
  const api = makeApi(async () => { throw new Error("must not be called"); }, "t", allowedRepos(cfg));
  await assert.rejects(() => api.call("PATCH", "/repos/O/qnfo-workers", { archived: true }), /not allowlisted/);
}

// dry: only GET calls
{
  const g = fake();
  const res = await run("all", "dry", cfg, g.f, "t");
  assert.equal(g.writes.length, 0, "dry writes nothing");
  assert.ok(res.calls.every((c) => c.method === "GET"));
  assert.equal(res.ok, true);
}

// archive alone refuses the after_copy repository while files are still to copy
{
  const g = fake();
  const res = await run("archive", "live", cfg, g.f, "t");
  const src = res.archive.find((r) => r.repo === "u/src");
  assert.equal(src.ok, false); assert.equal(g.repos["u/src"].archived, false);
  assert.equal(g.repos["O/old"].archived, true, "the others still archive");
}

// live all: copy, README, archive, pages probe, transfer, idempotent second run
{
  const g = fake();
  const res = await run("all", "live", cfg, g.f, "t");
  assert.equal(res.ok, true, JSON.stringify(res.archive));
  assert.equal(g.repos["O/dst"].files["a.md"], "A");
  assert.equal(g.repos["O/dst"].files["skills/s.md"], "OTHER", "never overwrites");
  assert.equal(g.repos["O/dst"].files["imported/src/skills/s.md"], "S");
  assert.equal(g.repos["O/dst"].files[".github/workflows/x.yml"], undefined, "excluded prefix");
  assert.ok(g.repos["O/old"].files["README.md"].startsWith("> **Archived 2026-11-09 (" + MARK));
  assert.equal(g.repos["O/old"].archived, true); assert.equal(g.repos["u/src"].archived, true);
  const old = res.archive.find((r) => r.repo === "O/old"); assert.equal(old.site_status, 200);
  assert.ok(res.archive.find((r) => r.repo === "O/done").already);
  assert.ok(g.repos["O/dash"] && !g.repos["u/dash"]);
  const n = g.writes.length;
  const again = await run("all", "live", cfg, g.f, "t");
  assert.equal(again.ok, true, JSON.stringify([again.copy, again.archive, again.transfer])); assert.equal(g.writes.length, n, "second run writes nothing");
}

// the real config is well formed
{
  const real = loadConfig(new URL("./repo-consolidation.json", import.meta.url).pathname);
  assert.equal(new Set(real.archive.map((a) => a.repo)).size, real.archive.length);
  assert.ok(!real.archive.some((a) => /qnfo-workers$|\/qnfo-research$|\/deepchat$/.test(a.repo)), "keepers are never archived");
}
console.log("repo-consolidation.test.mjs: ok");
