// ASSIGN-COPILOT-ISSUES-1 offline suite (scripts/assign-copilot-sweep.mjs, workflow assign-copilot-on-issue). No network: a fake GitHub.
// Proves: a trusted new issue is assigned to copilot-swe-agent[bot] with the Quniverse custom agent, the repository's own default branch and the
// static instructions; pull requests, closed issues, issues Copilot already has or ever had, archived repositories and issues written by strangers
// are left alone; a human the assignment call added is removed again and one that was already there is not; the oldest issue goes first, the issue
// that fired the run goes before all of them, and the per-run cap defers the rest; a 401 stops the run, a refusal for one repository skips only
// that repository, and nothing throws; dry sends no write; no credential sends nothing; the organization agent is created, updated or left alone
// by blob sha, never from an invalid source; the workflow keeps QNFO_GH_PAT (not GITHUB_TOKEN), a timeout, pinned actions and no input in a run line.
// Run: node --no-warnings scripts/assign-copilot-sweep.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, normalize, trusted, isCopilot, agentProblems, sinceIso, makeApi, syncOrgAgent, INSTRUCTIONS, AGENT, COPILOT_BOT, AGENT_SOURCE, AGENT_TARGET } from "./assign-copilot-sweep.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };

const NOW = Date.parse("2026-10-30T09:00:00Z");
const AGENT_TEXT = "---\nname: Quniverse\ndescription: Operates the fleet.\ntarget: github-copilot\n---\n\nBody.\n";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const item = (n, over) => Object.assign({
  number: n, state: "open", repository_url: "https://api.github.com/repos/QNFO/qnfo-ops", html_url: "https://github.com/QNFO/qnfo-ops/issues/" + n,
  user: { login: "rwnq8" }, author_association: "OWNER", assignees: [], created_at: "2026-10-30T0" + (n % 9) + ":00:00Z"
}, over || {});

function fakeGh(cfg) {
  const log = [];
  const repos = Object.assign({ "QNFO/qnfo-ops": { default_branch: "main", archived: false }, "QNFO/qnfo-skills": { default_branch: "master", archived: false } }, cfg.repos || {});
  const files = Object.assign({}, cfg.files || {});
  const fetchImpl = async (url, init) => {
    const u = new URL(url), method = init.method || "GET", path = decodeURIComponent(u.pathname);
    log.push({ method, path, search: u.search, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
    const reply = (status, body) => ({ status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });
    if (cfg.networkDown) throw new Error("getaddrinfo ENOTFOUND api.github.com");
    if (path === "/search/issues") {
      if (cfg.searchStatus) return reply(cfg.searchStatus, { message: "Validation Failed" });
      const page = Number(u.searchParams.get("page") || 1);
      return reply(200, { items: (cfg.issues || []).slice((page - 1) * 100, page * 100) });
    }
    let m = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/events$/.exec(path);
    if (m) return reply(200, (cfg.events || {})[m[1] + "#" + m[2]] || []);
    m = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/assignees$/.exec(path);
    if (m && method === "POST") {
      const key = m[1] + "#" + m[2];
      if (cfg.assignStatus && cfg.assignStatus[key]) return reply(cfg.assignStatus[key], { message: (cfg.assignMessage || {})[key] || "Forbidden" });
      if (cfg.assignRepoStatus && cfg.assignRepoStatus[m[1]]) return reply(cfg.assignRepoStatus[m[1]], { message: "Resource not accessible by personal access token" });
      const before = ((cfg.issues || []).find((i) => m[1] === "QNFO/qnfo-ops" && i.number === Number(m[2])) || { assignees: [] }).assignees;
      return reply(201, { assignees: before.concat([{ login: "Copilot" }], cfg.autoAdd || []) });
    }
    if (m && method === "DELETE") return reply(200, {});
    m = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(path);
    if (m) { const f = (cfg.single || {})[m[1] + "#" + m[2]]; return f ? reply(200, f) : reply(404, { message: "Not Found" }); }
    m = /^\/repos\/(QNFO\/[^/]+)\/contents\/(.+)$/.exec(path);
    if (m) {
      const k = m[1] + "|" + m[2];
      if (method === "GET") { const f = files[k]; return f ? reply(200, { sha: f.sha, content: b64(f.text) + "\n" }) : reply(404, { message: "Not Found" }); }
      if (method === "PUT") {
        if (cfg.putStatus) return reply(cfg.putStatus, { message: "Protected branch update failed" });
        const b = JSON.parse(init.body); files[k] = { sha: "sha-after-put", text: Buffer.from(b.content, "base64").toString("utf8") }; return reply(files[k] && (cfg.files || {})[k] ? 200 : 201, { content: { path: m[2] } });
      }
    }
    m = /^\/repos\/([^/]+\/[^/]+)$/.exec(path);
    if (m) return repos[m[1]] ? reply(200, repos[m[1]]) : reply(404, { message: "Not Found" });
    return reply(404, { message: "Not Found" });
  };
  return { fetchImpl, log, files };
}
const go = (cfg, opts, extra) => { const g = fakeGh(cfg); return run(Object.assign({ token: "SECRET-TOKEN-123", hours: 24, max: 25, pauseMs: 0, agentSync: false }, opts || {}), Object.assign({ fetchImpl: g.fetchImpl, now: NOW, sleep: async () => {} }, extra || {})).then((s) => ({ s, g })); };
const posts = (g) => g.log.filter((c) => c.method === "POST");

// helpers
ok(isCopilot("Copilot") && isCopilot("copilot-swe-agent[bot]") && isCopilot("copilot-swe-agent") && !isCopilot("rwnq8") && !isCopilot("copilot-fan"), "isCopilot matches the bot's three spellings and nothing else");
ok(sinceIso(NOW, 24) === "2026-10-29T09:00:00Z", "the look-back is an ISO time without milliseconds", sinceIso(NOW, 24));
ok(trusted(normalize(item(1))) && trusted(normalize(item(2, { author_association: "COLLABORATOR" }))) && trusted(normalize(item(3, { user: { login: "github-actions[bot]" }, author_association: "NONE" }))), "owner, collaborator and github-actions[bot] authors are trusted");
ok(!trusted(normalize(item(4, { user: { login: "stranger" }, author_association: "NONE" }))) && !trusted(normalize(item(5, { user: { login: "fan" }, author_association: "CONTRIBUTOR" }))) && !trusted(normalize(item(6, { user: { login: "evil[bot]" }, author_association: "NONE" }))), "a stranger, a past contributor and another bot are not trusted");
ok(normalize(item(7)).owner === "QNFO" && normalize(item(7)).repo === "qnfo-ops", "the repository comes from repository_url");
ok(agentProblems(AGENT_TEXT).length === 0 && agentProblems("no front matter").length === 1 && agentProblems("---\nname: X\n---\n").join().includes("description") && agentProblems(AGENT_TEXT + "ghp_" + "a".repeat(30)).join().includes("token"), "agentProblems accepts a profile and names a missing description, front matter or an embedded token");
ok(!/\$\{|\{\{/.test(INSTRUCTIONS) && INSTRUCTIONS.length < 2000 && /work-claim/.test(INSTRUCTIONS) && /acquired:false/.test(INSTRUCTIONS) && /never assign the issue to a user/i.test(INSTRUCTIONS), "the instructions are static, short, carry the claim fallback and forbid assigning a person");

// 1. a trusted new issue is assigned with the exact payload
let { s, g } = await go({ issues: [item(11)] });
ok(s.status === "ok" && s.assigned === 1 && posts(g).length === 1, "one trusted new issue is assigned", s);
const p = posts(g)[0];
ok(p && p.path === "/repos/QNFO/qnfo-ops/issues/11/assignees" && JSON.stringify(p.body.assignees) === JSON.stringify([COPILOT_BOT]), "the call goes to the assignees endpoint with copilot-swe-agent[bot] only", p);
ok(p && p.body.agent_assignment.custom_agent === AGENT && AGENT === "quniverse" && p.body.agent_assignment.target_repo === "QNFO/qnfo-ops" && p.body.agent_assignment.base_branch === "main" && p.body.agent_assignment.custom_instructions === INSTRUCTIONS, "agent_assignment names the Quniverse agent, this repository and its default branch", p && p.body);
const searchCall = g.log.find((c) => c.path === "/search/issues");
const q = decodeURIComponent(searchCall.search);
ok(/q=org:QNFO is:issue is:open archived:false created:>=2026-10-29T09:00:00Z/.test(q), "the search is every open, non-archived issue of the organization created inside the window", q);
ok(g.log.every((c) => c.auth === "Bearer SECRET-TOKEN-123") && !JSON.stringify(s).includes("SECRET-TOKEN-123") && !g.log.some((c) => c.path.includes("SECRET")), "the credential is sent as a bearer token and appears in no summary and no path");
({ s, g } = await go({ issues: [item(12, { repository_url: "https://api.github.com/repos/QNFO/qnfo-skills" })], repos: {} }));
ok(posts(g)[0] && posts(g)[0].body.agent_assignment.base_branch === "master" && posts(g)[0].body.agent_assignment.target_repo === "QNFO/qnfo-skills", "the default branch of the issue's own repository is used (master here)", posts(g)[0] && posts(g)[0].body);

// 2. what is left alone
({ s, g } = await go({
  issues: [
    item(21, { pull_request: {} }), item(22, { state: "closed" }), item(23, { assignees: [{ login: "Copilot" }] }),
    item(24, { user: { login: "stranger" }, author_association: "NONE" }), item(25), item(26, { repository_url: "https://api.github.com/repos/QNFO/old" }), item(27)
  ],
  events: { "QNFO/qnfo-ops#25": [{ event: "assigned", assignee: { login: "Copilot" } }, { event: "unassigned", assignee: { login: "Copilot" } }] },
  repos: { "QNFO/old": { default_branch: "main", archived: true } }
}));
ok(s.assigned === 1 && posts(g).length === 1 && posts(g)[0].path.endsWith("/27/assignees"), "only the clean trusted issue is assigned", s);
ok(s.skipped["pull-request"] === 1 && s.skipped["not-open"] === 1 && s.skipped["already-assigned"] === 1 && s.skipped["untrusted-author"] === 1 && s.skipped["previously-assigned"] === 1 && s.skipped["repo-archived"] === 1, "each skip is counted under its reason", s.skipped);
ok(!g.log.some((c) => c.path.includes("/issues/24/")) && !g.log.some((c) => c.path.includes("/issues/23/")), "a stranger's issue and an already assigned issue cost no further call");

// 3. no person is ever assigned
({ s, g } = await go({ issues: [item(31)], autoAdd: [{ login: "rwnq8" }] }));
const del = g.log.find((c) => c.method === "DELETE");
ok(del && del.path === "/repos/QNFO/qnfo-ops/issues/31/assignees" && JSON.stringify(del.body) === JSON.stringify({ assignees: ["rwnq8"] }) && s.person_removed[0].logins[0] === "rwnq8", "a human the assignment added is removed again", del);
({ s, g } = await go({ issues: [item(32, { assignees: [{ login: "someone" }] })], autoAdd: [] }));
ok(!g.log.some((c) => c.method === "DELETE") && s.assigned === 1, "an assignee that was already on the issue is left in place");

// 4. order, priority and cap
({ s, g } = await go({ issues: [item(43, { created_at: "2026-10-30T03:00:00Z" }), item(41, { created_at: "2026-10-30T01:00:00Z" }), item(42, { created_at: "2026-10-30T02:00:00Z" }), item(44, { created_at: "2026-10-30T04:00:00Z" })] }, { max: 2 }));
ok(posts(g).map((c) => c.path.split("/")[5]).join() === "41,42" && s.deferred === 2 && s.assigned === 2, "the oldest issues go first and the cap defers the rest", { order: posts(g).map((c) => c.path), s });
({ s, g } = await go({ issues: [item(51, { created_at: "2026-10-30T01:00:00Z" }), item(52, { created_at: "2026-10-30T02:00:00Z" })], single: { "QNFO/qnfo-ops#53": item(53, { created_at: "2026-10-30T08:59:00Z" }) } }, { max: 1, priority: { repo: "QNFO/qnfo-ops", number: 53 } }));
ok(posts(g).length === 1 && posts(g)[0].path.includes("/issues/53/") && s.deferred === 2, "the issue that fired the run goes before older ones", posts(g).map((c) => c.path));
({ s, g } = await go({ issues: [item(61)], single: { "QNFO/qnfo-ops#61": item(61) } }, { priority: { repo: "QNFO/qnfo-ops", number: 61 } }));
ok(posts(g).length === 1 && s.considered === 1, "an issue that is both priority and in the search is handled once");
({ s, g } = await go({ issues: [] }, { priority: { repo: "QNFO/qnfo-ops", number: 99 } }));
ok(s.errors.length === 1 && s.errors[0].http === 404 && posts(g).length === 0, "an unreadable priority issue is reported and does not stop the sweep");

// 5. failures never throw and never loop
({ s, g } = await go({ issues: [item(71, { created_at: "2026-10-30T01:00:00Z" }), item(72, { created_at: "2026-10-30T02:00:00Z" }), item(73, { created_at: "2026-10-30T03:00:00Z" })], assignStatus: { "QNFO/qnfo-ops#71": 401 }, assignMessage: { "QNFO/qnfo-ops#71": "Bad credentials" } }));
ok(s.status === "stopped" && posts(g).length === 1 && /401/.test(s.stopped), "a 401 stops the run after the first refusal", s);
({ s, g } = await go({ issues: [item(81), item(82)], assignStatus: { "QNFO/qnfo-ops#81": 403 }, assignMessage: { "QNFO/qnfo-ops#81": "You have exceeded a secondary rate limit" } }));
ok(s.status === "stopped" && posts(g).length === 1, "a rate limit stops the run", s);
({ s, g } = await go({ issues: [item(91), item(92), item(93, { repository_url: "https://api.github.com/repos/QNFO/qnfo-skills" })], assignRepoStatus: { "QNFO/qnfo-ops": 403 } }));
ok(s.status === "partial" && posts(g).length === 2 && s.skipped["repo-refused"] === 1 && s.assigned === 1, "a refusal for one repository skips that repository's other issues and not the rest", s);
({ s, g } = await go({ issues: [item(95)], assignStatus: { "QNFO/qnfo-ops#95": 422 }, assignMessage: { "QNFO/qnfo-ops#95": "Validation Failed" } }));
ok(s.status === "partial" && s.assigned === 0 && s.errors[0].http === 422, "a 422 is recorded and the run still completes", s);
({ s } = await go({ issues: [item(96)], searchStatus: 422 }));
ok(s.errors[0].where === "search" && s.assigned === 0, "a failed search assigns nothing and says so");
({ s } = await go({ issues: [item(97)], networkDown: true }));
ok(s.status === "partial" && s.assigned === 0 && s.errors.some((e) => /network/.test(e.message)), "a network failure is an error row and not an exception", s);
({ s, g } = await go({ issues: [item(98)] }, { token: "" }));
ok(s.status === "no-credential" && g.log.length === 0 && s.assigned === 0, "no credential sends nothing and says why");

// 6. dry
({ s, g } = await go({ issues: [item(101), item(102)] }, { mode: "dry" }));
ok(s.mode === "dry" && s.would_assign.length === 2 && !g.log.some((c) => c.method !== "GET"), "dry names what it would assign and sends no write", s);

// 7. the organization agent
const SRC_KEY = AGENT_SOURCE.repo + "|" + AGENT_SOURCE.path, DST_KEY = AGENT_TARGET.repo + "|" + AGENT_TARGET.path;
let g2 = fakeGh({ files: { [SRC_KEY]: { sha: "aaa1111", text: AGENT_TEXT } } });
let r = await syncOrgAgent(makeApi(g2.fetchImpl, "t"), false);
let put = g2.log.find((c) => c.method === "PUT");
ok(r.status === "created" && put && put.path === "/repos/QNFO/.github/contents/agents/quniverse.agent.md" && put.body.branch === "master" && put.body.sha === undefined && Buffer.from(put.body.content, "base64").toString("utf8") === AGENT_TEXT, "a missing organization agent is created on master, byte for byte", r);
g2 = fakeGh({ files: { [SRC_KEY]: { sha: "aaa1111", text: AGENT_TEXT }, [DST_KEY]: { sha: "bbb2222", text: "old" } } });
r = await syncOrgAgent(makeApi(g2.fetchImpl, "t"), false); put = g2.log.find((c) => c.method === "PUT");
ok(r.status === "updated" && put && put.body.sha === "bbb2222", "a different organization agent is replaced with the sha it replaces", r);
g2 = fakeGh({ files: { [SRC_KEY]: { sha: "aaa1111", text: AGENT_TEXT }, [DST_KEY]: { sha: "aaa1111", text: AGENT_TEXT } } });
r = await syncOrgAgent(makeApi(g2.fetchImpl, "t"), false);
ok(r.status === "in-sync" && !g2.log.some((c) => c.method === "PUT"), "an identical organization agent is left alone", r);
g2 = fakeGh({ files: { [SRC_KEY]: { sha: "ccc3333", text: "no front matter" } } });
r = await syncOrgAgent(makeApi(g2.fetchImpl, "t"), false);
ok(r.status === "source-invalid" && !g2.log.some((c) => c.method === "PUT"), "an invalid source profile is never published", r);
g2 = fakeGh({});
r = await syncOrgAgent(makeApi(g2.fetchImpl, "t"), false);
ok(r.status === "source-unreadable" && !g2.log.some((c) => c.method === "PUT"), "an unreadable source publishes nothing", r);
g2 = fakeGh({ files: { [SRC_KEY]: { sha: "aaa1111", text: AGENT_TEXT } }, putStatus: 403 });
r = await syncOrgAgent(makeApi(g2.fetchImpl, "t"), false);
ok(r.status === "write-refused" && r.http === 403, "a refused write is reported with its status", r);
g2 = fakeGh({ files: { [SRC_KEY]: { sha: "aaa1111", text: AGENT_TEXT } } });
r = await syncOrgAgent(makeApi(g2.fetchImpl, "t"), true);
ok(r.status === "would-create" && !g2.log.some((c) => c.method === "PUT"), "dry reports would-create and writes nothing", r);
({ s, g } = await go({ issues: [item(111)], files: { [SRC_KEY]: { sha: "aaa1111", text: AGENT_TEXT } }, putStatus: 403 }, { agentSync: true }));
ok(s.agent_sync.status === "write-refused" && s.assigned === 1, "a refused organization-agent write does not stop the assignments", s);

// 8. the files in this repository
const wf = readFileSync(join(root, ".github", "workflows", "assign-copilot-on-issue.yml"), "utf8");
const live = wf.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
ok(/GH_PAT_TOKEN: \$\{\{ secrets\.QNFO_GH_PAT \}\}/.test(live) && !/secrets\.GITHUB_TOKEN/.test(live), "the workflow authenticates with QNFO_GH_PAT and never with GITHUB_TOKEN");
ok(/^permissions:\n  contents: read\n/m.test(live) && !/issues:\s*write/.test(live), "the workflow's own token is read-only (the user token does the write)");
ok(/timeout-minutes: \d+/.test(live) && /runs-on: ubuntu-24\.04/.test(live) && /group: assign-copilot-on-issue\n\s+cancel-in-progress: false/.test(live), "the job has a timeout, the pinned runner and a non-cancelling concurrency group");
ok(/issues:\n\s+types: \[opened\]/.test(live) && /workflow_run:\n\s+workflows: \["remediation-consumer"\]/.test(live) && /workflow_dispatch:/.test(live) && /schedule:/.test(live), "it fires on issue opened, after remediation-consumer, by schedule and by hand");
ok(!live.split("\n").some((l) => /^\s*(run:|-?\s*run:)/.test(l) && /\$\{\{/.test(l)) && /node scripts\/assign-copilot-sweep\.mjs/.test(live), "no expression reaches a run line (inputs travel through env) and the script is the one under test");
ok(/uses: actions\/checkout@[0-9a-f]{40} # v\d/.test(live) && /uses: actions\/setup-node@[0-9a-f]{40} # v\d/.test(live), "both actions are pinned to a commit sha with a version comment");
const agentSrc = readFileSync(join(root, ".github", "agents", "quniverse.agent.md"), "utf8");
ok(agentProblems(agentSrc).length === 0, "the profile in this repository is one the sweep will publish", agentProblems(agentSrc));
ok(/Assign Copilot|assign Copilot|ASSIGN-COPILOT-ISSUES-1/.test(readFileSync(join(root, "CLAUDE.md"), "utf8")), "CLAUDE.md records the automation and the cloud claim fallback");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
