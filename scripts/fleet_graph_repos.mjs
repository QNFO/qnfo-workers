// scripts/fleet_graph_repos.mjs: REPO-GRAPH-1 (2026-10-29, pillar autonomy; owner request: "I need code that unifies all this. How does the
// system know what repos to look in? How does the system even know itself?").
//
// WHAT   Teaches the fleet graph (scripts/fleet_graph.mjs, served by qnfo-memory-mcp /fleet-graph/*) two things it did not know:
//          repo:<owner>/<name>  every GitHub repository the system owns, from the checked-in manifest repos.json (id, plane, role, status,
//                               superseded_by, holds, private). repos.json is the one place that says which repositories exist and what each is for.
//          doc:<path>           every Markdown file under docs/ and at the repository root, with its title, charter pillar and size.
//        Edges: repo --holds--> worker:<name> (the hub), repo --supersedes--> repo, doc --mentions--> worker:<name>,
//        doc --describes--> repo:<id>, doc --links--> doc:<path>, and repo --documented_by--> doc:<path> when the manifest names one.
//        So `GET /fleet-graph/impact?id=worker:qnfo-ops` now lists the documents and repositories that talk about qnfo-ops, and
//        `GET /fleet-graph/find?query=<name>` finds a document or a repository by name.
//        Findings (each a line to read, not a verdict): repo-manifest-invalid (warn), repo-unregistered (warn: a live GitHub repository the manifest
//        does not list), repo-missing-on-github (warn: a manifest entry with no live repository), doc-orphan (info: no document, workflow or script links to it),
//        doc-names-retired-worker (info).
// LIMIT  Static text matching. A worker name in a document is an INFERRED mention. Private repositories are listed by manifest only and never fetched.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const PLANES = ["fleet", "research", "personal", "q08", "demo", "governance", "platform", "program", "archive"];
export const STATUSES = ["active", "superseded", "archived", "private"];
const MAX_DOC_BYTES = 400000;

export function loadManifest(root) {
  const p = join(root, "repos.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

// "QNFO/qwav-demo-*" matches "QNFO/qwav-demo-bt-qec"; an id without * matches exactly.
export function matchEntry(manifest, fullName) {
  const lc = fullName.toLowerCase();
  let hit = null;
  for (const r of manifest.repos) {
    const id = r.id.toLowerCase();
    if (id === lc) return r;
    if (id.endsWith("*") && lc.startsWith(id.slice(0, -1))) hit = hit || r;
  }
  return hit;
}

export function validateManifest(manifest) {
  const problems = [];
  if (!manifest || !Array.isArray(manifest.repos)) return ["repos.json has no repos array"];
  const ids = new Set();
  for (const r of manifest.repos) {
    if (!r.id || !/^[\w.-]+\/[\w.*-]+$/.test(r.id)) { problems.push("bad id: " + JSON.stringify(r.id)); continue; }
    if (ids.has(r.id)) problems.push("duplicate id " + r.id);
    ids.add(r.id);
    if (!PLANES.includes(r.plane)) problems.push(r.id + ": plane " + r.plane + " is not one of " + PLANES.join("|"));
    if (!STATUSES.includes(r.status)) problems.push(r.id + ": status " + r.status + " is not one of " + STATUSES.join("|"));
    if (!r.role) problems.push(r.id + ": no role");
  }
  for (const r of manifest.repos) if (r.superseded_by && !ids.has(r.superseded_by)) problems.push(r.id + ": superseded_by " + r.superseded_by + " is not in the manifest");
  // Personal/research separation (core rule 13): a personal-plane repository is never held by the hub's research side or documented as research.
  for (const r of manifest.repos) if (r.plane === "personal" && r.holds_research) problems.push(r.id + ": a personal repository cannot hold research");
  return problems;
}

function walkMd(root, rel, out, depth) {
  const dir = join(root, rel);
  let names; try { names = readdirSync(dir).sort(); } catch (e) { return; }
  for (const n of names) {
    if (n.startsWith(".") || n === "node_modules") continue;
    const r = rel ? rel + "/" + n : n;
    let st; try { st = statSync(join(root, r)); } catch (e) { continue; }
    if (st.isDirectory()) { if (depth < 4) walkMd(root, r, out, depth + 1); }
    else if (/\.md$/i.test(n) && st.size <= MAX_DOC_BYTES) out.push(r);
  }
}

export function listDocs(root) {
  const out = [];
  for (const n of readdirSync(root).sort()) { if (/\.md$/i.test(n)) out.push(n); }
  walkMd(root, "docs", out, 0);
  return out;
}

export function docMeta(text) {
  const title = ((/^#\s+(.+?)\s*$/m.exec(text) || [])[1] || "").replace(/[`*]/g, "").slice(0, 160);
  const pillar = ((/\b(?:charter\s+)?pillar[s]?[:\s]+`?(core|autonomy|research|reach|cost|security|personal)\b/i.exec(text) || [])[1] || "").toLowerCase() || null;
  return { title, pillar };
}

// g is the fleet_graph Graph (node/edge methods). workerNames: live worker directory names; retired: names of RETIRED/FOLDED directories.
export function addRepoDocs(g, root, workerNames, retired) {
  const result = { manifestProblems: [], orphans: [], retiredMentions: [], docs: 0, repos: 0 };
  const manifest = loadManifest(root);
  const repoIds = [];
  if (manifest) {
    result.manifestProblems = validateManifest(manifest);
    for (const r of manifest.repos) {
      if (!r.id || r.id.endsWith("*")) { if (r.id) { g.node("repo:" + r.id, "repo", r.id, { attrs: { plane: r.plane, role: r.role, status: r.status, pattern: true } }); repoIds.push(r.id); result.repos++; } continue; }
      g.node("repo:" + r.id, "repo", r.id, { attrs: { plane: r.plane, role: r.role, status: r.status, private: !!r.private, hub: !!r.hub, superseded_by: r.superseded_by || null } });
      repoIds.push(r.id); result.repos++;
      if (r.superseded_by) g.edge("repo:" + r.superseded_by, "supersedes", "repo:" + r.id, { path: "repos.json" });
      if (r.hub) for (const w of workerNames) g.edge("repo:" + r.id, "holds", "worker:" + w, { path: "repos.json" });
      for (const d of r.documented_by || []) if (existsSync(join(root, d))) g.edge("repo:" + r.id, "documented_by", "doc:" + d, { path: "repos.json" });
    }
  }
  const docs = listDocs(root);
  const docSet = new Set(docs);
  const linkedTo = new Set();
  const workerRe = workerNames.filter((w) => w.length >= 6).map((w) => [w, new RegExp("(?<![\\w-])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])")]);
  const retiredRe = (retired || []).filter((w) => w.length >= 8).map((w) => [w, new RegExp("(?<![\\w-])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])")]);
  const exact = (manifest ? manifest.repos : []).filter((r) => !r.id.endsWith("*"));
  for (const p of docs) {
    let text; try { text = readFileSync(join(root, p), "utf8"); } catch (e) { continue; }
    const m = docMeta(text);
    g.node("doc:" + p, "doc", p, { path: p, attrs: { title: m.title, pillar: m.pillar, bytes: text.length } });
    result.docs++;
    let n = 0;
    for (const [w, re] of workerRe) { if (n >= 40) break; if (re.test(text)) { g.edge("doc:" + p, "mentions", "worker:" + w, { path: p, confidence: "INFERRED" }); n++; } }
    for (const [w, re] of retiredRe) if (re.test(text) && !/RETIRED|retired|FOLDED|folded|superseded/.test(text)) result.retiredMentions.push({ doc: p, worker: w });
    for (const r of exact) {
      const name = r.id.split("/")[1];
      if (name.length < 6) continue;
      if (text.includes(r.id) || new RegExp("github\\.com/" + r.id.replace("/", "/") + "(?![\\w-])", "i").test(text)) g.edge("doc:" + p, "describes", "repo:" + r.id, { path: p, confidence: "INFERRED" });
    }
    for (const mm of new Set([...text.matchAll(/\b(docs\/[\w./-]+\.md)\b/g)].map((x) => x[1]))) {
      if (mm !== p && docSet.has(mm)) { g.edge("doc:" + p, "links", "doc:" + mm, { path: p }); linkedTo.add(mm); }
    }
  }
  // A document is not an orphan when a workflow, a script, a worker or the manifest names it by path.
  const indexed = new Set();
  const grepDirs = [".github/workflows", "scripts"];
  for (const d of grepDirs) {
    const dir = join(root, d); if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      let t; try { t = readFileSync(join(dir, f), "utf8"); } catch (e) { continue; }
      for (const mm of t.matchAll(/\bdocs\/[\w./-]+\.md\b/g)) indexed.add(mm[0]);
    }
  }
  for (const p of docs) if (!linkedTo.has(p) && !indexed.has(p) && p.startsWith("docs/") && !/^docs\/ops-governance\//.test(p) && !/^docs\/(CLOSEOUT|HANDOFF)-/.test(p)) result.orphans.push(p);
  return result;
}

// Live GitHub listing: public repositories only, so a private repository is never fetched or named.
export async function fetchGithubRepos(owners, token, fetchImpl) {
  const f = fetchImpl || fetch;
  const out = [];
  for (const o of owners) {
    for (let page = 1; page <= 10; page++) {
      const url = "https://api.github.com/" + (o.kind === "user" ? "users/" : "orgs/") + o.name + "/repos?type=public&per_page=100&page=" + page;
      const r = await f(url, { headers: Object.assign({ accept: "application/vnd.github+json", "user-agent": "qnfo-fleet-graph" }, token ? { authorization: "Bearer " + token } : {}) });
      if (!r.ok) throw new Error("GitHub " + url + " HTTP " + r.status);
      const rows = await r.json();
      for (const x of rows) out.push({ id: x.full_name, archived: !!x.archived, fork: !!x.fork });
      if (rows.length < 100) break;
    }
  }
  return out;
}

export function repoFindings(manifest, rd, liveRepos) {
  const out = [];
  const add = (kind, subject, severity, detail) => out.push({ id: kind + ":" + subject, kind, subject, severity, detail });
  for (const p of rd.manifestProblems || []) add("repo-manifest-invalid", p.slice(0, 80), "warn", p);
  if (manifest && liveRepos) {
    const live = new Map(liveRepos.map((r) => [r.id.toLowerCase(), r]));
    for (const r of liveRepos) {
      if (r.archived || r.fork) continue;
      if (!matchEntry(manifest, r.id)) add("repo-unregistered", r.id, "warn", "active public repository " + r.id + " is in no repos.json entry, so the system does not know what it is for; add an entry (id, plane, role, status)");
    }
    for (const e of manifest.repos) {
      if (e.id.endsWith("*") || e.private) continue;
      if (!live.has(e.id.toLowerCase())) add("repo-missing-on-github", e.id, "warn", "repos.json lists " + e.id + " but no public repository of that name exists");
    }
  }
  for (const p of rd.orphans || []) add("doc-orphan", p, "info", "no document, workflow or script links to " + p + " by path");
  for (const m of rd.retiredMentions || []) add("doc-names-retired-worker", m.doc + ":" + m.worker, "info", m.doc + " names " + m.worker + ", a worker directory marked RETIRED or FOLDED, without saying so");
  return out;
}

export async function selftestRepos(log, ok) {
  const mf = { repos: [
    { id: "QNFO/hub", plane: "fleet", role: "hub", status: "active", hub: true },
    { id: "QNFO/old", plane: "platform", role: "old copy", status: "superseded", superseded_by: "QNFO/hub" },
    { id: "QNFO/demo-*", plane: "demo", role: "demos", status: "active" },
    { id: "me/private-one", plane: "personal", role: "private", status: "private", private: true }] };
  ok(validateManifest(mf).length === 0, "a valid manifest has no problems");
  ok(validateManifest({ repos: [{ id: "a/b", plane: "nope", status: "active", role: "x" }] }).length === 1, "an unknown plane is a problem");
  ok(validateManifest({ repos: [{ id: "a/b", plane: "fleet", status: "active", role: "x", superseded_by: "a/c" }] }).length === 1, "superseded_by must exist");
  ok(validateManifest({ repos: [{ id: "a/b", plane: "fleet", status: "active", role: "x" }, { id: "a/b", plane: "fleet", status: "active", role: "x" }] }).length === 1, "duplicate id is a problem");
  ok(matchEntry(mf, "QNFO/demo-xyz").id === "QNFO/demo-*", "a pattern entry matches by prefix");
  ok(matchEntry(mf, "QNFO/hub").id === "QNFO/hub", "an exact entry matches");
  ok(matchEntry(mf, "QNFO/unknown") === null || matchEntry(mf, "QNFO/unknown") === undefined, "an unknown repository matches nothing");
  const fnd = repoFindings(mf, { manifestProblems: [], orphans: ["docs/X.md"], retiredMentions: [] }, [{ id: "QNFO/hub" }, { id: "QNFO/stray" }, { id: "QNFO/arch", archived: true }, { id: "QNFO/old" }]);
  const kinds = new Map(fnd.map((x) => [x.id, x.severity]));
  ok(kinds.get("repo-unregistered:QNFO/stray") === "warn", "a live active repository outside the manifest is a warn");
  ok(!kinds.has("repo-unregistered:QNFO/arch"), "an archived repository is not flagged");
  ok(!kinds.has("repo-missing-on-github:me/private-one"), "a private manifest entry is never expected live");
  ok(kinds.get("repo-missing-on-github:QNFO/demo-*") === undefined, "a pattern entry is not expected live by name");
  ok(kinds.get("doc-orphan:docs/X.md") === "info", "an orphan document is info");
  const meta = docMeta("# Title here\n\nCharter pillar: autonomy\n");
  ok(meta.title === "Title here" && meta.pillar === "autonomy", "docMeta reads title and pillar");
  const pages = await fetchGithubRepos([{ kind: "org", name: "x" }], "", async () => ({ ok: true, json: async () => [{ full_name: "x/a", archived: false, fork: false }] }));
  ok(pages.length === 1 && pages[0].id === "x/a", "fetchGithubRepos reads full_name");
}
