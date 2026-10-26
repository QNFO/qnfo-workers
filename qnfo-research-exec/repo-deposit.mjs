// REPO-DEPOSIT-1 (pillar research, agent_issues RESEARCH-PROVENANCE-1): atomic, verified deposit of a pipeline run and its paper
// into QNFO/qnfo-research. Offline suite: repo-deposit.test.mjs (a fake GitHub Git Data API). worker.js carries an identical
// copy between the REPO-DEPOSIT-BEGIN/END markers and the suite fails when the two differ.
// Standard: QNFO/qnfo-research docs/PROVENANCE-STANDARD.md (sections 3, 7, 8). The Python twin of the record builders is
// qnfo-research tools/provenance.py; testdata/parity-* is the golden both implementations must produce.
//
// Why it exists (measured 2026-10-26): the old writer made one contents-API PUT per file on one branch; parallel slots got HTTP 409,
// the loop ignored the status and logged ok (97 of 400 events), 154 manifest-listed files never landed, 48 runs have no manifest,
// papers/<slug> was written by a PUT without `sha` (HTTP 422 for every later version: 95 of 121 papers have one commit), the
// reconciled paper was never part of a run, and the ledger insert had unquoted SQL inside an empty catch.
const REPO_DEPOSIT_VERSION = "1.0.0";

const GH_API = "https://api.github.com";
const TARGET_CONSOLIDATED = { owner: "QNFO", repo: "qnfo-research", branch: "main", runsDir: "runs", layout: "consolidated" };
const TARGET_LEGACY = { owner: "QNFO", repo: "qnfo-ensemble-research", branch: "main", runsDir: "", layout: "legacy" };
const RUN_MANIFEST_V2 = "qnfo-run-manifest/2";
const PAPER_SCHEMA = "qnfo-paper-provenance/1";
const CRATE_FILE = "ro-crate-metadata.json";
const CRATE_CONTEXT = "https://w3id.org/ro/crate/1.2/context";
const CRATE_SPEC = "https://w3id.org/ro/crate/1.2";
const PROCESS_RUN_PROFILE = "https://w3id.org/ro/wfrun/process/0.4";
const QNFO_NS = "https://qnfo.org/ns/provenance#";
const ORCID = "https://orcid.org/0009-0002-4317-5604";
const AUTHOR_NAME = "Rowan Brad Quni-Gudzinas";
const LICENSE_ENTITY = { "@id": "https://qnfo.org/legal/license", "@type": "CreativeWork", name: "QNFO Unified License Agreement v2.1", identifier: "LicenseRef-QNFO-ULA-2.1" };
const SIDECARS = new Set(["MANIFEST.json", CRATE_FILE, ".gitkeep"]);

// ------------------------------------------------------------------------------------------------ bytes and hashes
const ENC = new TextEncoder();
function utf8(s) { return ENC.encode(String(s)); }
function hex(buf) { return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(""); }
async function sha256Hex(data) { return hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? utf8(data) : data)); }
// The id git gives a file (and Software Heritage's swh:1:cnt): sha1 of "blob <n>\0" + bytes. GitHub returns it for every blob we
// create, so comparing it with our own proves the stored bytes are the bytes we hashed.
async function gitBlobSha1(bytes) {
  const head = utf8("blob " + bytes.length + "\0");
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head, 0); all.set(bytes, head.length);
  return hex(await crypto.subtle.digest("SHA-1", all));
}
function b64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function dumpJson(obj) { return JSON.stringify(obj, null, 2) + "\n"; }
function encPath(p) { return String(p).split("/").map(encodeURIComponent).join("/"); }

// ------------------------------------------------------------------------------------------------ GitHub (Git Data API)
async function gh(env, deps, method, path, body, accept) {
  const f = (deps && deps.fetch) || fetch;
  try {
    const r = await f(GH_API + path, {
      method,
      headers: Object.assign({ Authorization: "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-research-exec", Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    if (!accept) { try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; } }
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json, text, retryAfter: Number(r.headers && r.headers.get && r.headers.get("retry-after")) || 0 };
  } catch (e) {
    return { status: 0, ok: false, json: null, text: "", error: String(e && e.message || e).slice(0, 200), retryAfter: 0 };
  }
}
const repoPath = (t) => "/repos/" + t.owner + "/" + t.repo;
const transient = (r) => r.status === 0 || r.status >= 500 || r.status === 429 || (r.status === 403 && r.retryAfter > 0);

async function readTextAt(env, deps, t, path, ref) {
  const r = await gh(env, deps, "GET", repoPath(t) + "/contents/" + encPath(path) + "?ref=" + encodeURIComponent(ref), null, "application/vnd.github.raw+json");
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("read " + path + " -> " + r.status + (r.error ? " " + r.error : ""));
  return r.text;
}
async function listTree(env, deps, t, treeSha) {
  const r = await gh(env, deps, "GET", repoPath(t) + "/git/trees/" + treeSha);
  if (!r.ok) throw new Error("tree " + treeSha + " -> " + r.status);
  return r.json.tree || [];
}
// Entries of a directory (by path) in the tree at `treeSha`; [] when the directory does not exist.
async function listDirAt(env, deps, t, treeSha, dir) {
  let sha = treeSha;
  for (const seg of String(dir).split("/").filter(Boolean)) {
    const hit = (await listTree(env, deps, t, sha)).find((e) => e.path === seg && e.type === "tree");
    if (!hit) return [];
    sha = hit.sha;
  }
  return listTree(env, deps, t, sha);
}
async function isAncestor(env, deps, t, commit, head) {
  if (commit === head) return true;
  const r = await gh(env, deps, "GET", repoPath(t) + "/compare/" + commit + "..." + head);
  return !!(r.ok && r.json && (r.json.status === "ahead" || r.json.status === "identical"));
}

// One commit for many files, all or nothing. `opts.build(ctx)` is called on every attempt with the current head and returns the
// changes ([{path, content}] or [{path, remove: true}]) so a retry re-reads what the other writer changed instead of overwriting it.
// Retries a refused (non-fast-forward) ref update, a 5xx, a rate limit and a lost connection; after an ambiguous failure it checks
// whether the commit landed before it tries again, so a lost response never produces a second commit.
async function commitAtomic(env, deps, t, opts) {
  const maxAttempts = opts.maxAttempts || 5;
  const sleep = (deps && deps.sleep) || ((ms) => new Promise((res) => setTimeout(res, ms)));
  const jitter = (deps && deps.random) || Math.random;
  const clock = (deps && deps.now) || Date.now, t0 = clock(), deadline = opts.deadlineMs || 45000;
  const blobs = new Map();
  let last = "";
  const wait = async (attempt, r) => sleep(Math.min(30000, (r && r.retryAfter ? r.retryAfter * 1000 : 0) || Math.round((400 * Math.pow(2, attempt - 1)) * (0.5 + jitter()))));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // A pipeline tick has a time budget: a GitHub outage must not hold it for minutes. The next tick retries.
    if (attempt > 1 && clock() - t0 > deadline) return { ok: false, landed: false, error: "deadline of " + deadline + " ms exceeded after " + (attempt - 1) + " attempts: " + last, attempts: attempt - 1 };
    const ref = await gh(env, deps, "GET", repoPath(t) + "/git/ref/heads/" + t.branch);
    if (!ref.ok) { last = "ref " + ref.status + (ref.error ? " " + ref.error : ""); if (transient(ref)) { await wait(attempt, ref); continue; } return { ok: false, landed: false, error: last, attempts: attempt }; }
    const head = ref.json.object.sha;
    const cm = await gh(env, deps, "GET", repoPath(t) + "/git/commits/" + head);
    if (!cm.ok) { last = "commit " + cm.status; if (transient(cm)) { await wait(attempt, cm); continue; } return { ok: false, landed: false, error: last, attempts: attempt }; }
    const treeSha = cm.json.tree.sha;
    const ctx = {
      head, treeSha, target: t,
      readText: (path) => readTextAt(env, deps, t, path, head),
      listDir: (dir) => listDirAt(env, deps, t, treeSha, dir),
    };
    let changes;
    try { changes = await opts.build(ctx); } catch (e) { return { ok: false, landed: false, error: "build: " + String(e && e.message || e).slice(0, 200), attempts: attempt }; }
    if (!changes || !changes.length) return { ok: true, empty: true, head, attempts: attempt, hashes: {} };
    const entries = [], hashes = {};
    let failed = null;
    for (const c of changes) {
      if (c.remove) { entries.push({ path: c.path, mode: "100644", type: "blob", sha: null }); continue; }
      const bytes = utf8(c.content);
      const h = await sha256Hex(bytes);
      hashes[c.path] = { sha256: h, bytes: bytes.length };
      let blobSha = blobs.get(h);
      if (!blobSha) {
        const b = await gh(env, deps, "POST", repoPath(t) + "/git/blobs", { content: b64(bytes), encoding: "base64" });
        if (!b.ok) { failed = b; break; }
        if (b.json.sha !== await gitBlobSha1(bytes)) return { ok: false, landed: false, error: "blob integrity: GitHub stored a different object for " + c.path, attempts: attempt };
        blobSha = b.json.sha; blobs.set(h, blobSha);
      }
      entries.push({ path: c.path, mode: "100644", type: "blob", sha: blobSha });
    }
    if (failed) { last = "blob " + failed.status; if (transient(failed)) { await wait(attempt, failed); continue; } return { ok: false, landed: false, error: last + " " + String(failed.text).slice(0, 120), attempts: attempt }; }
    const tr = await gh(env, deps, "POST", repoPath(t) + "/git/trees", { base_tree: treeSha, tree: entries });
    if (!tr.ok) { last = "tree " + tr.status; if (transient(tr)) { await wait(attempt, tr); continue; } return { ok: false, landed: false, error: last + " " + String(tr.text).slice(0, 160), attempts: attempt }; }
    const cr = await gh(env, deps, "POST", repoPath(t) + "/git/commits", { message: opts.message, tree: tr.json.sha, parents: [head] });
    if (!cr.ok) { last = "commit-create " + cr.status; if (transient(cr)) { await wait(attempt, cr); continue; } return { ok: false, landed: false, error: last + " " + String(cr.text).slice(0, 160), attempts: attempt }; }
    const commit = cr.json.sha;
    const up = await gh(env, deps, "PATCH", repoPath(t) + "/git/refs/heads/" + t.branch, { sha: commit, force: false });
    if (up.ok) return { ok: true, landed: true, commit, attempts: attempt, hashes, head };
    if (up.status === 422 || up.status === 409) { last = "non-fast-forward"; await wait(attempt, null); continue; }
    // Ambiguous (lost connection, 5xx): did it land? If so it is done; if not, a retry is safe.
    const now = await gh(env, deps, "GET", repoPath(t) + "/git/ref/heads/" + t.branch);
    if (now.ok && await isAncestor(env, deps, t, commit, now.json.object.sha)) return { ok: true, landed: true, commit, attempts: attempt, hashes, head, recovered: true };
    last = "ref-update " + up.status + (up.error ? " " + up.error : "");
    if (!transient(up)) return { ok: false, landed: false, error: last + " " + String(up.text).slice(0, 160), attempts: attempt };
    await wait(attempt, up);
  }
  return { ok: false, landed: false, error: "gave up after " + maxAttempts + " attempts: " + last, attempts: maxAttempts };
}

// ------------------------------------------------------------------------------------------------ record builders
const ROLE_PATTERNS = [
  [/^SHARED-PROMPT\.md$/, "prompt"], [/^grounding\.md$/, "grounding"],
  [/^writer-[a-z]-draft\.md$|^writer-[a-z]\/draft\.md$/, "draft"], [/^writer-[a-z]\/(notes|claims)\.md$/, "draft-support"],
  [/^(reconciled-paper|RECONCILIATION|citation-audit)\.md$|^reconciled\.md$/, "reconciliation"],
  [/^review-report(-\d+)?\.md$/, "review"], [/^verification\.md$/, "verification-report"], [/^verification\.py$/, "verification-script"],
  [/^MANIFEST\.json$/, "manifest"],
];
function roleOf(rel) { for (const [rx, role] of ROLE_PATTERNS) if (rx.test(rel)) return role; return "other"; }
function mimeOf(rel) { const m = /(\.[^./]+)$/.exec(rel); return ({ ".md": "text/markdown", ".py": "text/x-python", ".json": "application/json", ".txt": "text/plain" })[m ? m[1] : ""] || "application/octet-stream"; }

const ARXIV_RE = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})|arXiv:\s*(\d{4}\.\d{4,5})/gi;
const DOI_RE = /(?:doi\.org\/|doi:\s*)(10\.\d{4,9}\/[^\s)\]>"'`,;]+)/gi;
function sourcesOf(grounding) {
  const seen = new Map();
  for (const m of String(grounding).matchAll(ARXIV_RE)) {
    const aid = m[1] || m[2], id = "https://arxiv.org/abs/" + aid;
    if (!seen.has(id)) seen.set(id, { "@id": id, "@type": "ScholarlyArticle", identifier: "arXiv:" + aid });
  }
  for (const m of String(grounding).matchAll(DOI_RE)) {
    const doi = m[1].replace(/\.+$/, ""), id = "https://doi.org/" + doi;
    if (!seen.has(id)) seen.set(id, { "@id": id, "@type": "ScholarlyArticle", identifier: "doi:" + doi });
  }
  return Array.from(seen.keys()).sort().slice(0, 200).map((k) => seen.get(k));
}
function recordedOutput(md) { const m = /## Execution output\n```\n([\s\S]*?)\n```/.exec(String(md)); return m ? m[1] : null; }
function recordedExit(body) { const m = /\n*\[exit (-?\d+)\]\s*$/.exec(String(body)); return m ? Number(m[1]) : null; }
const ref = (rels) => rels.map((r) => ({ "@id": r }));

// files: [{rel, content}] present in the run directory; listed: {rel: {sha256}} from the manifest or null. Mirrors build_crate in
// qnfo-research tools/provenance.py (parity golden: testdata/parity-crate.json). `preserve` copies the independent re-execution
// recorded by that tool from the previous crate, so restoring a file does not erase it.
async function buildCrate(input) {
  const { runPath, cycle, slug, title, pipeline, deposit, listed } = input;
  const files = input.files.filter((f) => f.rel !== CRATE_FILE && !/(^|\/)\.gitkeep$/.test(f.rel)).slice().sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const paperUrl = slug ? "https://papers.qnfo.org/papers/" + (input.paperSlug || slug) : null;
  const root = {
    "@id": "./", "@type": "Dataset",
    name: "QNFO research run " + cycle + (slug ? ": " + (title || slug) : " (pilot)"),
    description: "Interim and final artifacts of one run of the QNFO automated research pipeline, kept as deposited. MANIFEST.json is the pipeline's own record and is never rewritten; this crate adds the standard packaging, per-file fixity and the stage structure of the run.",
    author: { "@id": ORCID }, license: { "@id": LICENSE_ENTITY["@id"] }, conformsTo: [{ "@id": PROCESS_RUN_PROFILE }],
    "qnfo:cycle": cycle, "qnfo:runPath": runPath,
  };
  if (slug) root["qnfo:slug"] = slug;
  if (pipeline) root["qnfo:pipelineVersion"] = pipeline;
  if (deposit) { root.datePublished = deposit.date; if (deposit.commit) root["qnfo:depositCommit"] = deposit.commit; }
  if (paperUrl) root.about = { "@id": paperUrl };
  const parts = [], fileEnts = [], roles = {};
  for (const f of files) {
    const bytes = utf8(f.content), role = roleOf(f.rel);
    fileEnts.push({ "@id": f.rel, "@type": "File", name: f.rel, encodingFormat: mimeOf(f.rel), contentSize: String(bytes.length), sha256: await sha256Hex(bytes), "qnfo:role": role, "qnfo:listedInManifest": !!(listed && listed[f.rel]) || f.rel === "MANIFEST.json" });
    parts.push({ "@id": f.rel });
    (roles[role] = roles[role] || []).push(f.rel);
  }
  const have = new Set(files.map((f) => f.rel));
  const missingEnts = Object.keys(listed || {}).filter((fn) => !have.has(fn)).sort().map((fn) => ({ "@id": "#missing/" + fn, "@type": "CreativeWork", name: fn, sha256: listed[fn].sha256 || null, "qnfo:status": "listed-in-manifest-absent-from-repository" }));
  if (missingEnts.length) root["qnfo:missingParts"] = missingEnts.map((m) => ({ "@id": m["@id"] }));
  root.hasPart = parts;
  const cp = { "@id": "#cpython", "@type": "SoftwareApplication", name: "CPython", description: "Interpreter that ran verification.py in the pipeline; its version was not recorded." };
  const app = { "@id": "#pipeline", "@type": "SoftwareApplication", name: "qnfo-research-exec", url: "https://github.com/QNFO/qnfo-workers/tree/main/qnfo-research-exec" };
  if (pipeline) app.version = pipeline;
  const actions = [];
  let prev = [];
  for (const [aid, name, rls] of [["#grounding", "Literature grounding", ["prompt", "grounding"]], ["#drafting", "Independent drafting", ["draft", "draft-support"]], ["#reconciliation", "Reconciliation and citation audit", ["reconciliation"]], ["#review", "Adversarial review", ["review"]]]) {
    const out = [].concat(...rls.map((r) => roles[r] || []));
    if (!out.length) continue;
    const act = { "@id": aid, "@type": "CreateAction", name, instrument: { "@id": "#pipeline" }, result: ref(out), actionStatus: { "@id": "http://schema.org/CompletedActionStatus" }, "qnfo:basis": "inferred-from-procedure" };
    if (prev.length) act.object = ref(prev);
    actions.push(act);
    prev = out;
  }
  let graphSrc = [];
  if (roles.grounding) {
    const srcs = sourcesOf(files.find((f) => f.rel === roles.grounding[0]).content);
    if (srcs.length) {
      const g = actions.find((a) => a["@id"] === "#grounding");
      if (g) { g.object = srcs.map((s) => ({ "@id": s["@id"] })); g["qnfo:sourcesBasis"] = "extracted-by-regex-from-grounding.md"; }
      graphSrc = srcs;
    }
  }
  const vscript = roles["verification-script"] || [], vreport = roles["verification-report"] || [];
  const extra = [];
  if (vscript.length) {
    const rec = vreport.length ? recordedOutput(files.find((f) => f.rel === vreport[0]).content) : null;
    const rcode = rec !== null ? recordedExit(rec) : null;
    const orig = { "@id": "#verification-original", "@type": "CreateAction", name: "verification.py as run by the pipeline", instrument: { "@id": "#cpython" }, object: ref(vscript), result: ref(vreport.length ? vreport : vscript), actionStatus: { "@id": rcode ? "http://schema.org/FailedActionStatus" : "http://schema.org/CompletedActionStatus" }, "qnfo:basis": "recorded-in-verification.md" };
    if (rcode !== null) orig["qnfo:exitCode"] = rcode;
    if (deposit) { orig.endTime = deposit.date; orig.description = "endTime is the deposit time; the execution time itself was not recorded."; }
    actions.push(orig);
    const prior = input.preserve && input.preserve["@graph"];
    const reex = prior && prior.find((e) => e["@id"] === "#verification-reexecution");
    if (reex) {
      actions.push(reex);
      for (const id of [reex.instrument && reex.instrument["@id"], reex.agent && reex.agent["@id"]]) { const e = prior.find((x) => x["@id"] === id); if (e) extra.push(e); }
    }
  }
  root.mentions = actions.map((a) => ({ "@id": a["@id"] }));
  const graph = [{ "@id": CRATE_FILE, "@type": "CreativeWork", about: { "@id": "./" }, conformsTo: { "@id": CRATE_SPEC } }, ...extra, root, LICENSE_ENTITY, { "@id": PROCESS_RUN_PROFILE, "@type": "CreativeWork", name: "Process Run Crate", version: "0.4" }, { "@id": ORCID, "@type": "Person", name: AUTHOR_NAME }, cp, app];
  if (paperUrl) graph.push({ "@id": paperUrl, "@type": ["CreativeWork", "ScholarlyArticle"], name: title || slug, url: paperUrl });
  return { "@context": [CRATE_CONTEXT, { qnfo: QNFO_NS }], "@graph": graph.concat(graphSrc, fileEnts, missingEnts, actions) };
}

// The v2 manifest: what v1 recorded plus the run's identity, the configured models, the paper, a role per file and real byte counts
// (v1 `bytes` was a JavaScript string length for 1,843 of 2,338 files).
async function buildManifestV2(input) {
  const files = {};
  for (const f of input.files.slice().sort((a, b) => (a.rel < b.rel ? -1 : 1))) {
    if (SIDECARS.has(f.rel)) continue;
    const bytes = utf8(f.content);
    files[f.rel] = { sha256: await sha256Hex(bytes), bytes: bytes.length, role: roleOf(f.rel) };
  }
  const m = {
    schema: RUN_MANIFEST_V2, pipeline: input.pipeline,
    run: { id: input.runId, slug: input.slug, cycle: input.cycle, worker: "qnfo-research-exec", worker_version: input.workerVersion, finished_at: input.finishedAt },
    models: Object.assign({ basis: "configured-at-deposit" }, input.models || {}),
    paper: input.paper ? { version: input.paper.version || null, sha256: await sha256Hex(input.paper.body), bytes: utf8(input.paper.body).length, path: input.paper.path } : null,
    files,
  };
  return m;
}

function firstMatch(rx, text) { const m = rx.exec(text); return m ? m[1].trim() : null; }
function declaredOf(readme, paperText) {
  const head = String(paperText || "").slice(0, 6000), dois = [], seen = new Set();
  for (const [src, text] of [["README.md", String(readme || "")], ["paper.md", head]]) {
    for (const m of text.matchAll(/(?:DOI:?\**\s*|doi\.org\/)(10\.\d{4,9}\/[^\s)\]>"'*]+)/gi)) {
      const doi = m[1].replace(/[.,;]+$/, ""), key = doi + "|" + src;
      if (seen.has(key)) continue;
      seen.add(key);
      dois.push({ doi, source: src });
    }
  }
  return { version: firstMatch(/\*\*Version:\*\*\s*([0-9][^\s*]*)/, head), license: firstMatch(/^License:\s*(.+)$/m, String(readme || "")), dois };
}
function titleOf(paperText) { for (const line of String(paperText).split("\n").slice(0, 40)) if (line.startsWith("# ")) return line.slice(2).trim(); return null; }
function readmeFor(title, slug) {
  return "# " + (title || slug) + "\n\nAuthor: " + AUTHOR_NAME + " (ORCID 0009-0002-4317-5604)\nLicense: QNFO-ULA v2.0 (CC BY-NC-SA 4.0 with the QNFO Supplemental Terms, https://legal.qnfo.org/)\n\nAuto-deposited by qnfo-research-exec (artifact-deposition P3).";
}

// provenance.json for one paper (schemas/paper-provenance.schema.json). Snapshots and events are append-only; runs are a union.
async function updatePaperRecord(prior, input) {
  const sha = await sha256Hex(input.body), bytes = utf8(input.body).length;
  const p = prior && typeof prior === "object" ? prior : {};
  const snaps = Array.isArray(p.snapshots) ? p.snapshots.slice() : [];
  if (!snaps.some((s) => s.sha256 === sha)) snaps.push({ sha256: sha, bytes, recorded_at: input.now, basis: input.basis || "deposit", version: input.version || declaredOf(input.readme, input.body).version, git_commit: input.gitCommit || null });
  const runs = Array.isArray(p.runs) ? p.runs.slice() : [];
  for (const r of input.runs || []) { const i = runs.findIndex((x) => x.path === r.path); if (i < 0) runs.push(r); else runs[i] = Object.assign({}, runs[i], r); }
  const events = Array.isArray(p.events) ? p.events.slice() : [];
  if (input.event) events.push({ event: input.event.event, at: input.now, detail: input.event.detail || null });
  const slug = input.slug;
  const prevIds = p.identifiers && Array.isArray(p.identifiers.research_queue_ids) ? p.identifiers.research_queue_ids : [];
  const ids = { research_queue_ids: input.runId && !prevIds.includes(input.runId) ? prevIds.concat([input.runId]) : prevIds.slice(), living_paper_slug: (p.identifiers && p.identifiers.living_paper_slug) || slug };
  return {
    schema: PAPER_SCHEMA, slug,
    paper: { path: input.paperDir + "/paper.md", title: input.title || titleOf(input.body), url: "https://papers.qnfo.org/papers/" + slug },
    declared: declaredOf(input.readme, input.body), runs,
    identifiers: ids,
    snapshots: snaps, events,
  };
}

// ------------------------------------------------------------------------------------------------ deposits
async function nextCycle(ctx, t) {
  const entries = await ctx.listDir(t.runsDir);
  let n = 0;
  for (const e of entries) { const m = /^cycle-(\d+)$/.exec(e.path); if (m) n = Math.max(n, Number(m[1])); }
  return n + 1;
}

// One paper's run (and, in the consolidated layout, its paper) in one commit. input: {runId, slug, title, pipeline, workerVersion,
// models, finishedAt, now, artifacts: [{file, content}], paper: {body, version, dir} | null}. Returns {ok, status, commit, cycle,
// runPath, manifestSha256, error}; status is "ok" | "landed-unverified" | "error". Nothing is reported ok unless the commit is on the
// branch and the manifest reads back with the hash we wrote.
async function depositRun(env, deps, t, input) {
  let out = null;
  const res = await commitAtomic(env, deps, t, {
    message: "research-pipeline: " + input.slug + " (run " + String(input.runId).slice(0, 8) + ")\n\nRun-Id: " + input.runId + "\nPipeline: " + input.pipeline + " / qnfo-research-exec " + input.workerVersion,
    build: async (ctx) => {
      const cycleN = await nextCycle(ctx, t), cycle = "cycle-" + cycleN;
      const runPath = (t.runsDir ? t.runsDir + "/" : "") + cycle + "/" + input.slug;
      const files = input.artifacts.map((a) => ({ rel: a.file, content: a.content })).filter((f) => !SIDECARS.has(f.rel));
      const paperPath = input.paper && t.layout === "consolidated" ? input.paper.dir + "/paper.md" : null;
      const manifest = await buildManifestV2({ files, pipeline: input.pipeline, runId: input.runId, slug: input.slug, cycle, workerVersion: input.workerVersion, finishedAt: input.finishedAt, models: input.models, paper: input.paper && paperPath ? { version: input.paper.version, body: input.paper.body, path: paperPath } : null });
      const manifestText = dumpJson(manifest);
      const all = files.concat([{ rel: "MANIFEST.json", content: manifestText }]);
      const crate = await buildCrate({ runPath, cycle, slug: input.slug, title: input.title, pipeline: input.pipeline, deposit: { date: input.finishedAt, commit: null }, listed: manifest.files, files: all });
      const crateText = dumpJson(crate);
      const changes = all.map((f) => ({ path: runPath + "/" + f.rel, content: f.content })).concat([{ path: runPath + "/" + CRATE_FILE, content: crateText }]);
      if (paperPath) {
        const prevProv = await ctx.readText(input.paper.dir + "/provenance.json");
        const prevReadme = await ctx.readText(input.paper.dir + "/README.md");
        const readme = prevReadme !== null ? prevReadme : readmeFor(input.title, input.slug);
        const prior = prevProv ? JSON.parse(prevProv) : null;
        const rec = await updatePaperRecord(prior, { slug: input.slug, paperDir: input.paper.dir, title: input.title, body: input.paper.body, version: input.paper.version, readme, now: input.now, basis: prior ? "revision" : "deposit", runId: input.runId, runs: [{ path: runPath, relation: "produced-by", match: "slug-exact", manifest_sha256: await sha256Hex(manifestText) }] });
        const prevPaper = await ctx.readText(paperPath);
        if (prevPaper !== input.paper.body) changes.push({ path: paperPath, content: input.paper.body });
        if (prevReadme === null) changes.push({ path: input.paper.dir + "/README.md", content: readme });
        changes.push({ path: input.paper.dir + "/provenance.json", content: dumpJson(rec) });
      }
      out = { cycle, runPath, manifestSha256: await sha256Hex(manifestText), paperPath };
      return changes;
    },
  });
  if (!res.ok) return { ok: false, status: "error", error: res.error, attempts: res.attempts };
  const verify = await verifyReadBack(env, deps, t, res.commit, out.runPath + "/MANIFEST.json", out.manifestSha256);
  return { ok: verify.ok, status: verify.ok ? "ok" : "landed-unverified", commit: res.commit, attempts: res.attempts, cycle: out.cycle, runPath: out.runPath, paperPath: out.paperPath, manifestSha256: out.manifestSha256, error: verify.ok ? null : verify.error };
}

async function verifyReadBack(env, deps, t, commit, path, want) {
  const sleep = (deps && deps.sleep) || ((ms) => new Promise((res) => setTimeout(res, ms)));
  let err = "";
  for (let i = 0; i < 3; i++) {
    try {
      const text = await readTextAt(env, deps, t, path, commit);
      if (text !== null && await sha256Hex(text) === want) return { ok: true };
      err = text === null ? "manifest not found at commit" : "manifest hash differs at commit";
    } catch (e) { err = String(e && e.message || e).slice(0, 160); }
    await sleep(1500);
  }
  return { ok: false, error: err };
}

// Paper text only (no run): a revision published through publishV2, a claim-integrity correction or retraction, or a restore.
// papers: [{slug, dir, title, body, version, event?}]. Unchanged text is not committed. The README is created once, never overwritten.
async function depositPapers(env, deps, t, papers, opts) {
  const o = opts || {};
  let summary = null;
  const res = await commitAtomic(env, deps, t, {
    message: (o.message || "paper-sync") + (papers.length === 1 ? ": " + papers[0].slug : ": " + papers.length + " papers"),
    build: async (ctx) => {
      const changes = [], done = [];
      for (const p of papers) {
        const prevPaper = await ctx.readText(p.dir + "/paper.md");
        const prevReadme = await ctx.readText(p.dir + "/README.md");
        const prevProv = await ctx.readText(p.dir + "/provenance.json");
        const readme = prevReadme !== null ? prevReadme : readmeFor(p.title, p.slug);
        const prior = prevProv ? JSON.parse(prevProv) : null;
        const basis = p.basis || (prevPaper === null ? (o.restore ? "restore" : "deposit") : "revision");
        const rec = await updatePaperRecord(prior, { slug: p.slug, paperDir: p.dir, title: p.title, body: p.body, version: p.version, readme, now: o.now, basis, runs: p.runs || [], event: p.event || (prevPaper === null && o.restore ? { event: "restored", detail: "paper text restored from living-paper" } : null) });
        const recText = dumpJson(rec);
        if (prevPaper === p.body && prevProv === recText) continue;
        if (prevPaper !== p.body) changes.push({ path: p.dir + "/paper.md", content: p.body });
        if (prevReadme === null) changes.push({ path: p.dir + "/README.md", content: readme });
        if (prevProv !== recText) changes.push({ path: p.dir + "/provenance.json", content: recText });
        done.push(p.slug);
      }
      summary = done;
      return changes;
    },
  });
  if (!res.ok) return { ok: false, status: "error", error: res.error, attempts: res.attempts, slugs: [] };
  return { ok: true, status: "ok", empty: !!res.empty, commit: res.commit || null, attempts: res.attempts, slugs: summary || [] };
}

// Gap-ledger restore. The rows come from provenance/known-gaps.json in the repository. sources.runFile(slug, name, sha256) returns the
// text of a run artifact from R2 (the copy whose hash matches if there is one) or null; sources.paper(slug) returns {title, body,
// version, dir?} from living-paper or null. A missing run file is restored only if its sha256 equals the one the manifest recorded;
// otherwise the row says why it cannot be (so it is not asked again every tick, and the rows behind it are reached). One commit
// carries the files, the regenerated crate of each touched run and the updated ledger.
async function restoreFromGaps(env, deps, t, sources, opts) {
  const o = Object.assign({ maxChecks: 30, maxPapers: 3 }, opts || {});
  let report = null;
  const res = await commitAtomic(env, deps, t, {
    message: "restore: gap ledger",
    build: async (ctx) => {
      const text = await ctx.readText("provenance/known-gaps.json");
      if (!text) return null;
      const ledger = JSON.parse(text);
      const rep = { restoredFiles: 0, unrecoverable: 0, restoredPapers: 0, checked: 0 };
      const changes = [], gaps = [], touched = new Set();
      let checks = 0, papers = 0, dirty = false;
      for (const g of ledger.gaps || []) {
        if (g.kind === "manifest-file-missing" && g.status === "open") {
          const slug = g.path.split("/")[2], unrec = Object.assign({}, g.unrecoverable || {}), remaining = [], expected = {};
          for (const fn of g.files) {
            const want = (g.expected_sha256 || {})[fn];
            if (unrec[fn] || checks >= o.maxChecks || !want) { remaining.push(fn); if (want) expected[fn] = want; continue; }
            checks++; rep.checked++;
            const got = await sources.runFile(slug, fn, want);
            if (got !== null && await sha256Hex(got) === want) { changes.push({ path: g.path + "/" + fn, content: got }); rep.restoredFiles++; touched.add(g.path); continue; }
            unrec[fn] = got === null ? "no copy in R2 for any run of this slug" : "the copy in R2 is a different version (its hash differs from the manifest's)";
            rep.unrecoverable++; dirty = true; remaining.push(fn); expected[fn] = want;
          }
          if (remaining.length) {
            const row = Object.assign({}, g, { files: remaining, expected_sha256: expected });
            if (Object.keys(unrec).length) row.unrecoverable = unrec;
            if (remaining.every((fn) => unrec[fn])) row.status = "unrecoverable";
            gaps.push(row);
          }
          continue;
        }
        if (g.kind === "paper-text-not-in-repo" && g.status === "open" && papers < o.maxPapers) {
          const slug = g.path.split("/")[1], p = await sources.paper(slug);
          papers++;
          if (!p) { gaps.push(g); continue; }
          const dir = p.dir || "papers/" + slug, readme = readmeFor(p.title, slug);
          const rec = await updatePaperRecord(null, { slug, paperDir: dir, title: p.title, body: p.body, version: p.version, readme, now: o.now, basis: "restore", runs: (g.runs || []).map((r) => ({ path: r, relation: "produced-by", match: "slug-exact", manifest_sha256: null })), event: { event: "restored", detail: "paper text restored from living-paper" } });
          changes.push({ path: dir + "/paper.md", content: p.body }, { path: dir + "/README.md", content: readme }, { path: dir + "/provenance.json", content: dumpJson(rec) });
          rep.restoredPapers++;
          continue;
        }
        gaps.push(g);
      }
      report = rep;
      if (!changes.length && !dirty) return null;
      for (const runPath of touched) {
        const manText = await ctx.readText(runPath + "/MANIFEST.json");
        if (!manText) continue;
        const prevCrate = await ctx.readText(runPath + "/" + CRATE_FILE), man = JSON.parse(manText), prior = prevCrate ? JSON.parse(prevCrate) : null;
        const present = [];
        for (const e of await ctx.listDir(runPath)) {
          if (e.type !== "blob" || e.path === CRATE_FILE) continue;
          const added = changes.find((c) => c.path === runPath + "/" + e.path);
          present.push({ rel: e.path, content: added ? added.content : await ctx.readText(runPath + "/" + e.path) });
        }
        for (const c of changes) if (c.path.startsWith(runPath + "/") && !present.some((f) => c.path === runPath + "/" + f.rel)) present.push({ rel: c.path.slice(runPath.length + 1), content: c.content });
        const root = prior && prior["@graph"].find((e) => e["@id"] === "./");
        const tm = root && /^QNFO research run cycle-\d+: (.+)$/.exec(root.name || "");
        const crate = await buildCrate({ runPath, cycle: runPath.split("/")[1], slug: runPath.split("/")[2], title: tm ? tm[1] : null, pipeline: man.pipeline, deposit: root && root.datePublished ? { date: root.datePublished, commit: root["qnfo:depositCommit"] || null } : null, listed: man.files || {}, files: present, preserve: prior });
        changes.push({ path: runPath + "/" + CRATE_FILE, content: dumpJson(crate) });
      }
      changes.push({ path: "provenance/known-gaps.json", content: dumpJson(Object.assign({}, ledger, { as_of: o.now || ledger.as_of, gaps })) });
      return changes;
    },
  });
  if (!res.ok) return { ok: false, status: "error", error: res.error, attempts: res.attempts };
  return Object.assign({ ok: true, status: "ok", commit: res.commit || null, empty: !!res.empty, attempts: res.attempts }, report || {});
}

// Which repository a deposit goes to. "auto" (the default) uses the consolidated repository once it carries the import marker
// provenance/IMPORT.json (the file the consolidation adds), otherwise the legacy ensemble repository, so the worker can be deployed
// before or after the repository change without a coordinated switch. ops_config research_repo_target = legacy | consolidated pins it.
// A transient error returns null (defer to the next tick) rather than guess: a flapping answer would scatter runs over both repositories.
async function resolveTarget(env, deps, mode) {
  if (mode === "legacy") return TARGET_LEGACY;
  if (mode === "consolidated") return TARGET_CONSOLIDATED;
  const r = await gh(env, deps, "GET", repoPath(TARGET_CONSOLIDATED) + "/contents/provenance/IMPORT.json?ref=" + TARGET_CONSOLIDATED.branch);
  if (r.ok) return TARGET_CONSOLIDATED;
  return r.status === 404 ? TARGET_LEGACY : null;
}

// Paper sync: compare the git copy of up to `k` papers (the slugs after `cursor` in the sorted list `slugs`) with the living-paper text
// and commit the ones that differ in one commit. `load(batch)` returns [{slug, dir, title, body, version}] for the batch members that are
// published (the others are skipped). Returns the next cursor ('' when the list wrapped); on an error the cursor does not move.
async function syncPapers(env, deps, t, slugs, load, cursor, k, now) {
  const start = slugs.findIndex((s) => s > (cursor || ""));
  if (start < 0) return { ok: true, checked: 0, changed: [], nextCursor: "" };
  const batch = slugs.slice(start, start + k);
  const next = start + k >= slugs.length ? "" : batch[batch.length - 1];
  const papers = await load(batch);
  if (!papers.length) return { ok: true, checked: batch.length, changed: [], nextCursor: next };
  const r = await depositPapers(env, deps, t, papers, { message: "paper-sync", now });
  return Object.assign({}, r, { checked: batch.length, changed: r.slugs || [], nextCursor: r.ok ? next : cursor || "" });
}

// Names of the sub-directories of `dir` at the branch head (the paper directories under papers/, the cycles under runs/).
async function listDirNames(env, deps, t, dir) {
  const ref = await gh(env, deps, "GET", repoPath(t) + "/git/ref/heads/" + t.branch);
  if (!ref.ok) throw new Error("ref " + ref.status);
  const cm = await gh(env, deps, "GET", repoPath(t) + "/git/commits/" + ref.json.object.sha);
  if (!cm.ok) throw new Error("commit " + cm.status);
  return (await listDirAt(env, deps, t, cm.json.tree.sha, dir)).filter((e) => e.type === "tree").map((e) => e.path);
}

export {
  REPO_DEPOSIT_VERSION, isAncestor, readTextAt, commitAtomic, depositRun, depositPapers, restoreFromGaps, syncPapers, listDirNames, resolveTarget,
  buildCrate, buildManifestV2, updatePaperRecord, declaredOf, sourcesOf, roleOf, readmeFor, titleOf,
  sha256Hex, gitBlobSha1, dumpJson, utf8, TARGET_CONSOLIDATED, TARGET_LEGACY, LICENSE_ENTITY, RUN_MANIFEST_V2, PAPER_SCHEMA,
};
