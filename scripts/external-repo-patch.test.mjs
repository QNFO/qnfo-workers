// EXTERNAL-REPO-PATCH-1 offline suite (scripts/external-repo-patch.mjs, agent_issues 2507 and 2508). No network: a fake contents API.
// Proves: dry mode reads and writes nothing and names create / replace / unchanged per file; live PUTs each changed file with the sha it
// replaces and skips an unchanged one; the FIRST refusal stops the run and is recorded verbatim, never retried with another credential;
// a missing credential is a refusal that sends nothing; only the two repositories and .github/workflows paths are reachable; a staged file
// that still carries an audited defect blocks live; and the files staged in this repository today have none of them.
// Run: node --no-warnings scripts/external-repo-patch.test.mjs   -> prints "N passed, 0 failed"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run, stagedFiles, defects, makeApi, TARGETS, STAGE } from "./external-repo-patch.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

const GOOD = "name: t\non:\n  workflow_dispatch:\n    inputs:\n      title:\n        type: string\njobs:\n  j:\n    runs-on: ubuntu-latest\n    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1\n      - env:\n          IN_TITLE: ${{ inputs.title }}\n        run: echo \"$IN_TITLE\"\n";
const root = mkdtempSync(join(tmpdir(), "erp-"));
const stage = (dir, name, text) => { mkdirSync(join(root, STAGE, dir, ".github", "workflows"), { recursive: true }); writeFileSync(join(root, STAGE, dir, ".github", "workflows", name), text); };
stage("QNFO-.github", "a.yml", GOOD);
stage("QNFO-.github", "b.yml", GOOD + "# b\n");
stage("QNFO-.github", "c.yml", GOOD + "# c\n");
writeFileSync(join(root, STAGE, "QNFO-.github", "0001.patch"), "not a workflow");

function fakeContents(opts = {}) {
  const files = { ...(opts.files || {}) }; // "repo|path|branch" -> {content, sha}
  const log = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url); const method = init.method || "GET";
    const m = /^\/repos\/(QNFO\/[^/]+)\/contents\/(.+)$/.exec(u.pathname);
    log.push({ method, path: u.pathname + u.search, auth: init.headers.Authorization || null });
    const reply = (status, body) => ({ status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (!m) return reply(404, { message: "Not Found" });
    const repo = m[1], p = decodeURIComponent(m[2]);
    if (method === "GET") { const f = files[repo + "|" + p + "|" + u.searchParams.get("ref")]; return f ? reply(200, { sha: f.sha, content: Buffer.from(f.content).toString("base64") + "\n" }) : reply(404, { message: "Not Found" }); }
    if (method === "PUT") {
      if (opts.refuse && opts.refuse.test(p)) return reply(opts.refuseStatus || 403, { message: opts.refuseMessage || "Resource not accessible by personal access token" });
      const b = JSON.parse(init.body); files[repo + "|" + p + "|" + b.branch] = { content: Buffer.from(b.content, "base64").toString("utf8"), sha: "new-" + log.length, putSha: b.sha }; return reply(200, { content: { sha: "x" } });
    }
    return reply(405, { message: "no" });
  };
  return { fetchImpl, log, files };
}

// staging
const st = stagedFiles(root, "QNFO/.github");
ok(st.map((x) => x.path).join() === ".github/workflows/a.yml,.github/workflows/b.yml,.github/workflows/c.yml", "only .github/workflows/*.yml are staged files (the .patch beside them is not)", st.map((x) => x.path));
let threw = false; try { stagedFiles(root, "QNFO/QWAV"); } catch (e) { threw = true; }
ok(threw, "a repository outside the allowlist throws (QNFO/QWAV was fixed upstream and is not a target)");

// dry run
let g = fakeContents({ files: { "QNFO/.github|.github/workflows/a.yml|master": { content: GOOD, sha: "sa" }, "QNFO/.github|.github/workflows/b.yml|master": { content: "old", sha: "sb" } } });
let r = await run("QNFO/.github", "dry", root, g.fetchImpl, {});
ok(r.ok && r.files.map((f) => f.action).join() === "unchanged,replace,create" && g.log.every((c) => c.method === "GET" && c.auth === null), "dry run: unchanged, replace, create; reads only, with no credential", r);
ok(/2 file\(s\) would be written/.test(r.dry_run_note), "dry run counts what live would write");

// live
g = fakeContents({ files: { "QNFO/.github|.github/workflows/a.yml|master": { content: GOOD, sha: "sa" }, "QNFO/.github|.github/workflows/b.yml|master": { content: "old", sha: "sb" } } });
r = await run("QNFO/.github", "live", root, g.fetchImpl, { GH_PAT_TOKEN: "pat_x" });
const puts = g.log.filter((c) => c.method === "PUT");
ok(r.ok && puts.length === 2 && r.files.find((f) => f.path.endsWith("b.yml")).write.status === 200 && g.files["QNFO/.github|.github/workflows/b.yml|master"].putSha === "sb", "live replaces with the sha of the file it replaces and creates the missing one", r);
ok(!puts.some((c) => c.path.includes("a.yml")), "an unchanged file is not written");
ok(g.log.every((c) => c.auth === "Bearer pat_x"), "one credential, sent only as the Authorization header");
ok(JSON.stringify(r).indexOf("pat_x") < 0, "the token is never in the result");
const again = await run("QNFO/.github", "live", root, g.fetchImpl, { GH_PAT_TOKEN: "pat_x" });
ok(again.ok && g.log.filter((c) => c.method === "PUT").length === 2 && again.files.every((f) => f.action === "unchanged"), "a second live run is a no-op");

// refusal: the first refusal stops the run, verbatim, no retry
g = fakeContents({ refuse: /b\.yml$/, files: { "QNFO/.github|.github/workflows/b.yml|master": { content: "old", sha: "sb" } } });
r = await run("QNFO/.github", "live", root, g.fetchImpl, { GH_PAT_TOKEN: "pat_weak" });
ok(!r.ok && r.refused.status === 403 && r.refused.message === "Resource not accessible by personal access token" && r.refused.call === "PUT .github/workflows/b.yml", "a refused PUT is recorded with its status and GitHub's own text", r.refused);
ok(g.log.filter((c) => c.method === "PUT").length === 2 && !g.log.some((c) => c.path.includes("c.yml") && c.method === "PUT"), "the run stops at the first refusal (a.yml written, b.yml refused, c.yml never tried) and nothing is retried");
ok(new Set(g.log.map((c) => c.auth)).size === 1, "no second credential is ever tried");
g = fakeContents();
r = await run("QNFO/.github", "live", root, g.fetchImpl, {});
ok(!r.ok && r.refused.status === 0 && /no GH_PAT_TOKEN/.test(r.refused.message) && g.log.every((c) => c.method === "GET"), "without GH_PAT_TOKEN live sends no write and says why");

// defects block live
stage("QNFO-.github", "bad.yml", "name: t\non: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo \"${{ github.event.inputs.paper }}\"\n      - run: echo ${{ github.event.release.body }}\n");
g = fakeContents();
r = await run("QNFO/.github", "live", root, g.fetchImpl, { GH_PAT_TOKEN: "pat_x" });
ok(!r.ok && r.problems.length === 3 && !g.log.some((c) => c.method === "PUT") && /live refused/.test(r.note), "live refuses a staged file with an injection and a Node 20 checkout, and writes nothing", r.problems);
r = await run("QNFO/.github", "dry", root, g.fetchImpl, {});
ok(r.ok && r.problems.length === 3, "dry run lists the same problems");
ok(defects("x.yml", GOOD).length === 0, "a clean file has no defect");
ok(defects("x.yml", "jobs:\n  a:\n    steps:\n      - uses: actions/upload-artifact@v4\n").some((d) => /upload-artifact v4 runs on Node 20/.test(d)) && defects("x.yml", "jobs:\n  a:\n    steps:\n      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2\n").length === 0, "a Node 20 major is a defect, a pinned v7 is not");
ok(defects("x.yml", "jobs:\n  a:\n    steps:\n      - run: echo a\n# https://claude.ai/x\n").length === 1, "a claude.ai link is a defect");

// allowlist
const api = makeApi(g.fetchImpl, "t");
let bad = 0;
for (const [repo, rel] of [["QNFO/other", "/contents/.github/workflows/a.yml"], ["QNFO/.github", "/contents/README.md"], ["QNFO/.github", "/contents/.github/workflows/../../x"], ["QNFO/.github", "/git/refs"], ["QNFO/QWAV", "/contents/.github/workflows/a.yml"]]) { try { await api.call(repo, "GET", rel); } catch (e) { bad++; } }
ok(bad === 5, "only the two repositories and .github/workflows files are reachable", bad);
ok((await run("QNFO/other", "dry", root, g.fetchImpl, {})).error.includes("not allowlisted") && (await run("QNFO/.github", "yolo", root, g.fetchImpl, {})).error.includes("mode"), "an unknown repository or mode is refused");
ok(JSON.stringify(Object.keys(TARGETS)) === '["QNFO/.github"]', "the allowlist is the one repository a session cannot reach");

// the files staged in this repository today
let realDefects = [];
for (const repo of Object.keys(TARGETS)) for (const f of stagedFiles(repoRoot, repo)) realDefects.push(...defects(f.path, f.content));
ok(realDefects.length === 0, "the workflow files staged in audits/gha-patches carry none of the audited defects", realDefects);
ok(stagedFiles(repoRoot, "QNFO/.github").length === 5, "five QNFO/.github workflow files are staged");
const wfText = readFileSync(join(repoRoot, ".github", "workflows", "external-repo-patch.yml"), "utf8");
ok(/GH_PAT_TOKEN: \$\{\{ secrets\.QNFO_GH_PAT \}\}/.test(wfText) && !/secrets\.GITHUB_TOKEN/.test(wfText) && !/run:.*\$\{\{ (github\.event\.)?inputs\./.test(wfText) && !/schedule:/.test(wfText), "the workflow uses only the QNFO_GH_PAT secret, passes inputs through env and is dispatch-only");

rmSync(root, { recursive: true, force: true });
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
