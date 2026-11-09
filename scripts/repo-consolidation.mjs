#!/usr/bin/env node
// scripts/repo-consolidation.mjs: REPO-CONSOLIDATION-1 (owner request 2026-11-09, rwnq8/agent-operating-system#3).
//
// WHAT   Finishes the repository consolidation planned in rwnq8/agent-operating-system REPOSITORIES.md, with the credential the
//        fleet already has (GH_ADMIN_TOKEN = the secret QNFO_GH_PAT), because an agent session holds no archive or transfer right.
//        Run by .github/workflows/repo-consolidation.yml. One action per run, one RESULT_JSON line, nothing secret printed.
//          report    read-only: every listed repository's archived flag, the credential's permissions on it, Pages state.
//          copy      add every file of a source repository to its target when absent; a file that exists and differs goes under
//                    the entry's conflict_dir instead, so nothing in the target is overwritten.
//          archive   per repository: write a README first line naming the new home, set archived, read it back; for a repository
//                    with Pages, read the Pages record and fetch the site so a broken page is seen.
//          transfer  move a repository to the new owner and read it back under the new name.
//          all       copy, archive, transfer, then report, in that order.
// SAFETY * Only the repositories named in scripts/repo-consolidation.json; any other path throws before a request is made.
//        * Archive, never delete: no DELETE call exists in this file. Reverting an archive is PATCH archived=false.
//        * dry (the default) makes GET calls only. A refusal is recorded with its status and GitHub's text and is never retried
//          with another credential or route. The token is never printed.
// USAGE  GH_ADMIN_TOKEN=... node scripts/repo-consolidation.mjs <action> [--mode dry|live] [--config path]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const ACTIONS = ["report", "copy", "archive", "transfer", "all"];
export const API = "https://api.github.com";
export const MARK = "REPO-CONSOLIDATION-1";

export function loadConfig(path) { return JSON.parse(readFileSync(path, "utf8")); }

export function allowedRepos(cfg) {
  const s = new Set();
  for (const c of cfg.copy || []) { s.add(c.source); s.add(c.target); }
  for (const a of cfg.archive || []) s.add(a.repo);
  for (const t of cfg.transfer || []) { s.add(t.repo); s.add(t.new_owner + "/" + t.repo.split("/")[1]); }
  return s;
}

export function makeApi(fetchImpl, token, allowed) {
  const calls = [];
  async function call(method, path, body) {
    const m = /^\/repos\/([^/]+\/[^/?]+)/.exec(path);
    if (!m || !allowed.has(m[1])) throw new Error("path not allowlisted: " + path);
    if (!token) { calls.push({ method, path, status: 0, message: "no credential" }); return { status: 0, body: null, ok: false, message: "no credential" }; }
    const init = { method, signal: AbortSignal.timeout(30000), headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "qnfo-repo-consolidation", "Content-Type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    let res, text = "";
    try { res = await fetchImpl(API + path, init); text = await res.text(); }
    catch (e) { const msg = "network: " + String((e && e.message) || e).slice(0, 160); calls.push({ method, path, status: 0, message: msg }); return { status: 0, body: null, ok: false, message: msg }; }
    let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) { j = null; }
    const message = res.status >= 400 ? String((j && j.message) || text || "").slice(0, 300) : "";
    calls.push({ method, path, status: res.status, message });
    return { status: res.status, body: j, ok: res.status >= 200 && res.status < 300, message };
  }
  return { call, calls };
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(String(s || "").replace(/\n/g, ""), "base64").toString("utf8");

// The redirect line written as the README's first line. Idempotent: a README that already starts with it is left alone.
export function redirectLine(cfg, entry) {
  return "> **Archived " + cfg.date + " (" + MARK + ").** This repository is read-only. Its content now lives in " + entry.home + ". Plan: rwnq8/agent-operating-system `REPOSITORIES.md`.";
}
export function withRedirect(readme, line) {
  const text = String(readme || "");
  if (text.startsWith(line)) return null;
  if (text.split("\n", 1)[0].includes(MARK)) return null;
  return line + "\n\n" + text;
}

export function conflictPath(entry, path) { return entry.conflict_dir + path; }
export function copyPlan(sourceFiles, targetFiles, entry) {
  // sourceFiles/targetFiles: Map path -> blob sha. Returns [{path, dest, why}] for files to write.
  const plan = [];
  for (const [path, sha] of sourceFiles) {
    if ((entry.exclude_prefixes || []).some((p) => path.startsWith(p))) continue;
    if (!targetFiles.has(path)) plan.push({ path, dest: path, why: "absent in target" });
    else if (targetFiles.get(path) !== sha) {
      const dest = conflictPath(entry, path);
      if (targetFiles.get(dest) !== sha) plan.push({ path, dest, why: "differs; kept under conflict_dir" });
    }
  }
  return plan;
}

async function tree(api, repo) {
  const r = await api.call("GET", "/repos/" + repo);
  if (!r.ok) return { error: r.status + " " + r.message };
  const branch = r.body.default_branch;
  if (r.body.archived) return { branch, archived: true, files: new Map() };
  const t = await api.call("GET", "/repos/" + repo + "/git/trees/" + encodeURIComponent(branch) + "?recursive=1");
  if (!t.ok) return { error: t.status + " " + t.message, branch };
  const files = new Map();
  for (const n of t.body.tree || []) if (n.type === "blob") files.set(n.path, n.sha);
  return { branch, files };
}

export async function doCopy(api, cfg, live) {
  const out = [];
  for (const entry of cfg.copy || []) {
    const src = await tree(api, entry.source), dst = await tree(api, entry.target);
    // An archived source was copied before it was archived (its README then gained the redirect line): nothing left to copy.
    if (src.archived) { out.push({ source: entry.source, target: entry.target, planned: 0, plan: [], written: [], ok: true, skipped: "source archived" }); continue; }
    if (src.error || dst.error) { out.push({ source: entry.source, target: entry.target, ok: false, error: src.error || dst.error }); continue; }
    const plan = copyPlan(src.files, dst.files, entry);
    const written = [];
    let ok = true;
    if (live) {
      for (const p of plan) {
        const blob = await api.call("GET", "/repos/" + entry.source + "/git/blobs/" + src.files.get(p.path));
        if (!blob.ok) { ok = false; written.push({ ...p, status: blob.status, message: blob.message }); break; }
        const put = await api.call("PUT", "/repos/" + entry.target + "/contents/" + p.dest.split("/").map(encodeURIComponent).join("/"), {
          message: MARK + ": copy " + p.path + " from " + entry.source + " (" + cfg.issue + ")", content: String(blob.body.content || "").replace(/\n/g, ""), branch: dst.branch
        });
        written.push({ ...p, status: put.status, message: put.message });
        if (!put.ok) { ok = false; break; }
      }
      // Read back: every planned destination now exists in the target with the source's blob.
      if (ok) {
        const after = await tree(api, entry.target);
        ok = !after.error && plan.every((p) => after.files.get(p.dest) === src.files.get(p.path));
      }
    }
    out.push({ source: entry.source, target: entry.target, planned: plan.length, plan, written, ok: live ? ok : true });
  }
  return out;
}

async function pagesProbe(api, repo, fetchImpl) {
  const p = await api.call("GET", "/repos/" + repo + "/pages");
  if (!p.ok) return { pages: p.status, message: p.message };
  let site = 0;
  try { const r = await fetchImpl(p.body.html_url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20000) }); site = r.status; } catch (e) { site = 0; }
  return { pages: p.status, build: p.body.status, url: p.body.html_url, site_status: site };
}

export async function doArchive(api, cfg, live, fetchImpl, copyResults) {
  const out = [];
  const copiedOk = new Set((copyResults || []).filter((c) => c.ok && (c.planned === 0 || (c.written && c.written.length === c.planned))).map((c) => c.source));
  for (const entry of cfg.archive || []) {
    const row = { repo: entry.repo };
    const r = await api.call("GET", "/repos/" + entry.repo);
    if (!r.ok) { out.push({ ...row, ok: false, error: r.status + " " + r.message }); continue; }
    row.admin = !!(r.body.permissions && r.body.permissions.admin);
    if (r.body.archived) { row.already = true; row.ok = true; if (r.body.has_pages) Object.assign(row, await pagesProbe(api, entry.repo, fetchImpl)); out.push(row); continue; }
    if (entry.after_copy && live && !copiedOk.has(entry.repo)) { out.push({ ...row, ok: false, error: "copy to its new home did not succeed in this run; not archived" }); continue; }
    const rm = await api.call("GET", "/repos/" + entry.repo + "/readme");
    const line = redirectLine(cfg, entry);
    const next = rm.ok ? withRedirect(unb64(rm.body.content), line) : line + "\n";
    row.readme = next === null ? "already" : (rm.ok ? "prepend " + rm.body.path : "create README.md");
    if (live) {
      if (next !== null) {
        const path = rm.ok ? rm.body.path : "README.md";
        const put = await api.call("PUT", "/repos/" + entry.repo + "/contents/" + path, { message: MARK + ": README names the new home before archiving (" + cfg.issue + ")", content: b64(next), ...(rm.ok ? { sha: rm.body.sha } : {}), branch: r.body.default_branch });
        row.readme_status = put.status;
        if (!put.ok) { out.push({ ...row, ok: false, error: "README write " + put.status + " " + put.message }); continue; }
      }
      const pa = await api.call("PATCH", "/repos/" + entry.repo, { archived: true });
      row.archive_status = pa.status;
      if (!pa.ok) { out.push({ ...row, ok: false, error: "archive " + pa.status + " " + pa.message }); continue; }
      const back = await api.call("GET", "/repos/" + entry.repo);
      row.ok = back.ok && back.body.archived === true;
    } else row.ok = true;
    if (r.body.has_pages) Object.assign(row, await pagesProbe(api, entry.repo, fetchImpl));
    out.push(row);
  }
  return out;
}

export async function doTransfer(api, cfg, live) {
  const out = [];
  for (const t of cfg.transfer || []) {
    const name = t.repo.split("/")[1], dest = t.new_owner + "/" + name;
    const now = await api.call("GET", "/repos/" + dest);
    if (now.ok && now.body.full_name.toLowerCase() === dest.toLowerCase()) { out.push({ repo: t.repo, dest, already: true, ok: true }); continue; }
    if (!live) { out.push({ repo: t.repo, dest, ok: true, dry: true }); continue; }
    const tr = await api.call("POST", "/repos/" + t.repo + "/transfer", { new_owner: t.new_owner });
    if (!tr.ok) { out.push({ repo: t.repo, dest, ok: false, error: tr.status + " " + tr.message }); continue; }
    let back = null;
    for (let i = 0; i < 10; i++) { back = await api.call("GET", "/repos/" + dest); if (back.ok && back.body.full_name.toLowerCase() === dest.toLowerCase()) break; await new Promise((r) => setTimeout(r, 3000)); }
    out.push({ repo: t.repo, dest, status: tr.status, ok: !!(back && back.ok && back.body.full_name.toLowerCase() === dest.toLowerCase()) });
  }
  return out;
}

export async function doReport(api, cfg, fetchImpl) {
  const out = [];
  for (const repo of allowedRepos(cfg)) {
    const r = await api.call("GET", "/repos/" + repo);
    if (!r.ok) { out.push({ repo, status: r.status, message: r.message }); continue; }
    const row = { repo: r.body.full_name, archived: r.body.archived, private: r.body.private, admin: !!(r.body.permissions && r.body.permissions.admin) };
    if (r.body.has_pages) Object.assign(row, await pagesProbe(api, repo, fetchImpl));
    out.push(row);
  }
  return out;
}

export async function run(action, mode, cfg, fetchImpl, token) {
  if (!ACTIONS.includes(action)) throw new Error("unknown action " + action);
  const live = mode === "live";
  const api = makeApi(fetchImpl, token, allowedRepos(cfg));
  const result = { action, mode: live ? "live" : "dry", marker: MARK };
  if (action === "copy" || action === "all") result.copy = await doCopy(api, cfg, live);
  // An after_copy entry is archived only when its copy is complete: written in this run, or nothing left to copy.
  if ((action === "archive") && live) result.copy_check = await doCopy(api, cfg, false);
  if (action === "archive" || action === "all") result.archive = await doArchive(api, cfg, live, fetchImpl, result.copy || result.copy_check);
  if (action === "transfer" || action === "all") result.transfer = await doTransfer(api, cfg, live);
  if (action === "report" || action === "all") result.report = await doReport(api, cfg, fetchImpl);
  const parts = [].concat(result.copy || [], result.archive || [], result.transfer || []);
  result.ok = parts.every((p) => p.ok);
  result.calls = api.calls;
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);
  const action = args[0] || "report";
  const mi = args.indexOf("--mode"), ci = args.indexOf("--config");
  const mode = mi >= 0 ? args[mi + 1] : "dry";
  const cfg = loadConfig(ci >= 0 ? args[ci + 1] : "scripts/repo-consolidation.json");
  const res = await run(action, mode, cfg, fetch, process.env.GH_ADMIN_TOKEN || "");
  console.log("RESULT_JSON " + JSON.stringify(res));
  for (const k of ["copy", "archive", "transfer", "report"]) for (const row of res[k] || []) console.log(k + " " + JSON.stringify({ ...row, plan: undefined }));
  process.exit(res.ok ? 0 : 1);
}
