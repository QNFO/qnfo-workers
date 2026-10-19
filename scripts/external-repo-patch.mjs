#!/usr/bin/env node
// scripts/external-repo-patch.mjs: EXTERNAL-REPO-PATCH-1 (agent_issues 2507 GHA-AUDIT-DOTGITHUB-1, pillar security).
//
// WHAT   Writes the staged workflow files under audits/gha-patches/<owner>-<repo>/.github/workflows/ into the two external repositories
//        the 2026-10-13 workflow audit found defective and a session cannot reach: QNFO/.github (branch master). QNFO/QWAV, the audit's other
//        repository, was fixed upstream by its own pull request 132 (2aff4f4, 2026-10-19) and is not a target. One contents-API PUT per
//        changed file, with the sha of the file it replaces. dry (default) only reads: for each file, create / replace / unchanged, and every
//        reason live would refuse.
// WHY    The code loop and every session are scoped to qnfo-workers: a session cannot attach QNFO/.github (the repository name starts
//        with a dot, so its clone directory would be hidden). The defects stayed live for six days (script injection through release names and dispatch inputs, Node 20
//        actions, a build workflow that cannot fire). The fleet already writes to QNFO/.github with a repository credential
//        (qnfo-cloud-ops PORTFOLIO-STATUS.md); this is that route for these files, run from a workflow with the secret QNFO_GH_PAT.
// SAFETY * Allowlist: the one repository, only .github/workflows/*.yml, only files staged in this repository. No other path is reachable.
//        * One credential (GH_PAT_TOKEN = QNFO_GH_PAT). The first refusal (401/403/404/422) stops the run and is recorded with its status
//          and GitHub's own text; it is never retried with another credential or another route. The token is never printed.
//        * live refuses a staged file that still has a defect this audit names: an input or release value inside a shell line, a Node 20
//          checkout/setup-python/upload-artifact/download-artifact major, a claude.ai link.
// USAGE  GH_PAT_TOKEN=... node scripts/external-repo-patch.mjs <QNFO/.github> [--mode dry|live] [--root .]
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const TARGETS = { "QNFO/.github": { branch: "master", dir: "QNFO-.github" } };
export const STAGE = "audits/gha-patches";
const PATH_RE = /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/;
const API = "https://api.github.com";
const NODE24_MIN = { "actions/checkout": 5, "actions/setup-python": 6, "actions/setup-node": 5, "actions/upload-artifact": 6, "actions/download-artifact": 6, "actions/cache": 5 };

export function stagedFiles(root, repo) {
  const t = TARGETS[repo];
  if (!t) throw new Error("repository not allowlisted: " + repo);
  const dir = join(root, STAGE, t.dir, ".github", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && PATH_RE.test(".github/workflows/" + f)).sort()
    .map((f) => ({ path: ".github/workflows/" + f, content: readFileSync(join(dir, f), "utf8") }));
}

// Offline defects of a staged file. A `KEY: ${{ ... }}` line is a map entry (env: or with:), which GitHub hands over as a value and never
// parses as shell; any other line that carries an input or release expression is shell text or a `run:` value.
export function defects(path, text) {
  const out = [];
  const lines = String(text).split("\n");
  lines.forEach((line, i) => {
    if (/^\s*#/.test(line)) return;
    if (/\$\{\{\s*(github\.event\.(inputs|release|pull_request|issue|comment|head_commit)|inputs)\./.test(line) && !/^\s*-?\s*[A-Za-z_][\w-]*:\s*\$\{\{/.test(line) && !/^\s*(if|name|run-name):/.test(line)) out.push(path + ":" + (i + 1) + " an input or event value inside a shell line: pass it through env:");
    const m = /uses:\s*([\w.-]+\/[\w.-]+)@(\S+)/.exec(line);
    if (m && NODE24_MIN[m[1]]) {
      const v = /^v?(\d+)/.exec(String(line.split("#")[1] || "").trim()) || /^v?(\d+)/.exec(m[2]);
      if (v && Number(v[1]) < NODE24_MIN[m[1]]) out.push(path + ":" + (i + 1) + " " + m[1] + " v" + v[1] + " runs on Node 20");
    }
  });
  if (/claude\.ai/.test(text)) out.push(path + ": a claude.ai link");
  if (!/^jobs:\s*$/m.test(text)) out.push(path + ": no jobs: block");
  return out;
}

export function makeApi(fetchImpl, token) {
  const calls = [];
  return {
    calls,
    async call(repo, method, rel, body) {
      if (!TARGETS[repo]) throw new Error("repository not allowlisted: " + repo);
      if (!/^\/contents\/\.github\/workflows\/[A-Za-z0-9._-]+(\?ref=[A-Za-z0-9._-]+)?$/.test(rel)) throw new Error("path not allowlisted: " + rel);
      const init = { method, headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "qnfo-external-repo-patch", "Content-Type": "application/json" } };
      if (token) init.headers.Authorization = "Bearer " + token;
      if (body !== undefined) init.body = JSON.stringify(body);
      let res, text = "";
      try { res = await fetchImpl(API + "/repos/" + repo + rel, init); text = await res.text(); } catch (e) { const r = { status: 0, body: null, message: "network: " + String(e && e.message || e).slice(0, 160) }; calls.push({ method, path: rel, status: 0 }); return r; }
      let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
      const message = res.status >= 400 ? String((j && j.message) || text || "").slice(0, 300) : "";
      calls.push({ method, path: rel, status: res.status });
      return { status: res.status, body: j, message };
    }
  };
}

export async function run(repo, mode, root, fetchImpl, env) {
  const t = TARGETS[repo];
  if (!t) return { ok: false, error: "repository not allowlisted; one of " + Object.keys(TARGETS).join(", ") };
  if (mode !== "dry" && mode !== "live") return { ok: false, error: "mode must be dry or live" };
  const token = (env && env.GH_PAT_TOKEN) || "";
  const api = makeApi(fetchImpl, token);
  const res = { action: "external-repo-patch", repo, branch: t.branch, mode, ok: false, files: [], problems: [], credential: token ? "QNFO_GH_PAT" : "none" };
  const staged = stagedFiles(root, repo);
  if (!staged.length) { res.problems.push("nothing staged under " + STAGE + "/" + t.dir); return res; }
  for (const f of staged) res.problems.push(...defects(f.path, f.content));
  const plan = [];
  for (const f of staged) {
    const rel = "/" + f.path.replace(/^\.github\/workflows\//, "contents/.github/workflows/") + "?ref=" + t.branch;
    const cur = await api.call(repo, "GET", rel);
    if (cur.status === 200 && cur.body && cur.body.content !== undefined) {
      const same = Buffer.from(String(cur.body.content).replace(/\n/g, ""), "base64").toString("utf8") === f.content;
      plan.push({ path: f.path, rel, sha: cur.body.sha, action: same ? "unchanged" : "replace", content: f.content });
    } else if (cur.status === 404) plan.push({ path: f.path, rel, sha: null, action: "create", content: f.content });
    else { res.files.push({ path: f.path, read: { status: cur.status, message: cur.message } }); res.problems.push("cannot read " + f.path + ": " + cur.status + " " + cur.message); }
  }
  for (const p of plan) res.files.push({ path: p.path, action: p.action });
  res.dry_run_note = plan.filter((p) => p.action !== "unchanged").length + " file(s) would be written";
  if (mode !== "live") { res.ok = true; return res; }
  if (!token) { res.refused = { call: "(none sent)", status: 0, message: "no GH_PAT_TOKEN (repository secret QNFO_GH_PAT is empty or unset): a write to another repository needs a credential that can write workflow files there" }; return res; }
  if (res.problems.length) { res.note = "live refused: fix the problems first"; return res; }
  res.ok = true;
  for (const p of plan) {
    if (p.action === "unchanged") continue;
    const body = { message: "ci: GHA-AUDIT hardening of " + p.path.split("/").pop() + " (QNFO/qnfo-workers agent_issues " + "2507" + ")", content: Buffer.from(p.content, "utf8").toString("base64"), branch: t.branch };
    if (p.sha) body.sha = p.sha;
    const w = await api.call(repo, "PUT", p.rel.replace(/\?ref=.*$/, ""), body);
    const row = res.files.find((x) => x.path === p.path);
    row.write = { status: w.status, message: w.message || undefined };
    if (w.status < 200 || w.status >= 300) { res.ok = false; res.refused = { call: "PUT " + p.path, status: w.status, message: w.message }; break; }
  }
  return res;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const res = await run(argv[0] || "", arg("--mode", "dry"), resolve(arg("--root", process.cwd())), fetch, process.env);
  console.log("RESULT_JSON=" + JSON.stringify(res));
  process.exit(res.ok ? 0 : 1);
}
function isEntry() { try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; } }
if (isEntry()) main();
