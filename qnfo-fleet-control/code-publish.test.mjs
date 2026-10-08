// PORTFOLIO-CODE-PUBLISH-1 (qnfo-fleet-control 0.12.0, agent_issues 2062): runs pfCodePublish against a fake GitHub and
// a fake D1. Proves: an absent repository is created public in the QNFO org; every file of the staged folder is copied
// to its relative path with the source's base64 content; a file already present is never replaced; the row turns public
// only when every file is in place; a refused create (403) is reported with its status and changes nothing.
// Run: node qnfo-fleet-control/code-publish.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const block = src.slice(src.indexOf("var PF_CODE_MAX_REPOS"), src.indexOf("async function pfWrittenDescriptions("));
const ghJson = src.slice(src.indexOf("async function pfGhJson("), src.indexOf("async function pfLicenseText("));
function harness(createStatus) {
  const repos = new Map([["QNFO/qnfo-workers", null]]);
  const files = { "research-code/lib-a/README.md": "UkVBRE1F\n", "research-code/lib-a/src/a.py": "cHJpbnQ=\n", "research-code/lib-a/.github/workflows/ci.yml": "Y2k=\n" };
  const target = new Map([["README.md", "b2xk"]]);
  const calls = [];
  const res = (status, body) => ({ status, async json() { return body; } });
  async function timedFetch(url, opt) {
    const m = (opt && opt.method) || "GET";
    calls.push(m + " " + url);
    if (m === "POST" && url.endsWith("/orgs/QNFO/repos")) { const b = JSON.parse(opt.body); if (createStatus !== 201) return res(createStatus, { message: "Resource not accessible by integration" }); repos.set("QNFO/" + b.name, b); return res(201, { full_name: "QNFO/" + b.name, private: b.private }); }
    let mm = url.match(/^https:\/\/api\.github\.com\/repos\/(QNFO\/[^/?]+)$/);
    if (mm) return repos.has(mm[1]) ? res(200, {}) : res(404, {});
    mm = url.match(/^https:\/\/api\.github\.com\/repos\/QNFO\/qnfo-workers\/contents\/(.+)\?ref=main$/);
    if (mm) {
      const path = decodeURIComponent(mm[1]);
      if (files[path]) return res(200, { content: files[path], path });
      const kids = new Map();
      for (const f of Object.keys(files)) if (f.startsWith(path + "/")) { const rest = f.slice(path.length + 1); const head = rest.split("/")[0]; kids.set(head, rest.includes("/") ? "dir" : "file"); }
      return kids.size ? res(200, [...kids].map(([n, t]) => ({ type: t, path: path + "/" + n }))) : res(404, {});
    }
    mm = url.match(/^https:\/\/api\.github\.com\/repos\/QNFO\/lib-a\/contents\/(.+)$/);
    if (mm) { const rel = decodeURIComponent(mm[1]); if (m === "GET") return target.has(rel) ? res(200, {}) : res(404, {}); target.set(rel, JSON.parse(opt.body).content); return res(201, { commit: { sha: "x" } }); }
    return res(500, {});
  }
  const rowState = { status: "staged" }, inserts = [];
  const AUDIT = { prepare(sql) { const st = { args: [], bind(...a) { st.args = a; return st; }, async all() { return { results: rowState.status === "staged" && /FROM research_code_libraries/.test(sql) ? [{ name: "lib-a", staged_path: "research-code/lib-a", repo: "QNFO/lib-a", field: "x", companion_doi: "10.x/1" }] : [] }; }, async run() { if (/UPDATE research_code_libraries SET status = 'public'/.test(sql)) rowState.status = "public"; if (/INSERT INTO portfolio_actions/.test(sql)) inserts.push(st.args); return {}; } }; return st; } };
  const sb = { timedFetch, PF_ORG: "QNFO", PF_WORKERS_REPO: "QNFO/qnfo-workers", pfGh: () => ({}), encodeURIComponent, JSON, String, Array, Error, Date, Math, console };
  vm.createContext(sb);
  vm.runInContext(ghJson + "\n" + block + "\n__f = pfCodePublish;", sb);
  return { run: () => sb.__f({ AUDIT }), repos, target, rowState, inserts, calls };
}
{
  const h = harness(201);
  const out = await h.run();
  ok(h.repos.get("QNFO/lib-a") && h.repos.get("QNFO/lib-a").private === false, "the absent repository is created public in QNFO");
  ok(h.target.get("src/a.py") === "cHJpbnQ=" && h.target.get(".github/workflows/ci.yml") === "Y2k=", "files land at their relative path with the source base64 (newlines stripped)", [...h.target]);
  ok(h.target.get("README.md") === "b2xk", "an existing file is never replaced");
  ok(h.rowState.status === "public" && out[0].status === "committed" && /2 copied, 1 present, 0 failed/.test(out[0].note), "the row turns public when every file is in place", out);
  ok(h.inserts.length === 1 && h.inserts[0][3] === "committed", "the outcome is a portfolio_actions row");
}
{
  const h = harness(403);
  const out = await h.run();
  ok(out[0].status === "write-failed" && /create HTTP 403/.test(out[0].note) && h.rowState.status === "staged" && h.target.size === 1, "a refused create is reported with its status and changes nothing", out);
}
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
