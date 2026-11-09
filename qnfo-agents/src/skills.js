// SKILL-SEARCH-1 (issue 9675, agent_issues 1002678): a searchable skill repository for the command line. A skill is a short procedure the agent or the owner can
// look up by keyword instead of loading a whole instructions file (docs/CODE-AGENT-UX.md: "skills by keyword"). Pure functions; the Worker routes and tools call them.
export const FLEET_SKILLS = [
  { name: "wrangler", kw: "wrangler deploy dev tail secret kv d1 r2 config toml cli", what: "Run or troubleshoot Wrangler in a project with a wrangler.toml.", steps: ["wrangler dev for local runs", "wrangler d1 execute <db> --command to read or write D1", "never deploy from a checkout: merge to main (canonical-deploy)"] },
  { name: "durable-objects", kw: "durable object do state sqlite alarm websocket coordination actor", what: "Build or review Durable Objects for persistent state and coordination.", steps: ["one class per concern, SQLite storage via this.sql", "alarms for schedules, keep constructors cheap", "migration entry in wrangler.toml for every new class"] },
  { name: "agents-sdk", kw: "agents sdk cloudflare agent callable schedule mcp chat session", what: "Build or debug Cloudflare Agents SDK apps (the agents package).", steps: ["extend Agent, expose methods with @callable", "this.schedule for later turns", "qnfo-agents/src/index.ts is the fleet reference"] },
  { name: "workers-best-practices", kw: "workers best practices production streaming waituntil bindings errors review", what: "Production rules for Workers code.", steps: ["no global mutable request state", "ctx.waitUntil for background work", "bindings over fetch to own hosts"] },
  { name: "d1-queries", kw: "d1 sql query audit qnfo-audit migration explain overload read replica", what: "Read and change qnfo-audit safely.", steps: ["migration file with APPLY-BY: ci, DB, Rollback headers", "EXPLAIN QUERY PLAN before a new hot query", "never scan whole tables on a hot path (D1 overload)"] },
  { name: "work-claim", kw: "work claim lock acquire release file issue guard coordination", what: "Take a work claim before editing a contended file.", steps: ["POST qnfo-deploy-guard /work-lock/acquire {key:file:<path>, owner, intent}", "acquired:false means another session holds it: review theirs", "release with outcome after the merge"] },
  { name: "worker-release-bump", kw: "version bump release worker_release mirror deployed-current pr merge canonical", what: "Bump a worker VERSION the fleet way.", steps: ["python scripts/worker_release.py bump <worker> --note \"...\"", "keep deployed-current.worker.js identical (the script copies it)", "python3 scripts/pre_push_check.py <worker> before the push"] },
  { name: "pull-request", kw: "pull request pr self-audit body checks merge lane green squash", what: "Open a PR the lane will merge.", steps: ["body has ## Self-audit with Real output:, Not thinking about:, and a fix reference", "body has a work-claim: line", "watch the five checks, fix red in the same turn, merge when green"] },
  { name: "deploy-probes", kw: "probes deploy canary revert health version probes.json verify live", what: "Declare what must still work after a deploy.", steps: ["worker/probes.json: routes with a real marker, /health min_version", "python scripts/deploy_probes.py --live <worker> before relying on one"] },
  { name: "agent-issues", kw: "issue agent_issues close evidence probe contract code-task triage", what: "File and close fleet issues.", steps: ["file with a code-task: line and a closing probe", "close only with issue_triage.close_evidence", "never wontfix to shrink the backlog"] },
  { name: "turnstile", kw: "turnstile captcha bot verification siteverify form", what: "Add Turnstile verification to a form and verify it server side.", steps: ["render the widget on the page", "POST the token to siteverify from the Worker", "fail closed when verification is not ready"] },
  { name: "email-service", kw: "email send routing cloudflare mail double opt-in subscribe outreach", what: "Send or route email through Cloudflare, with consent rules.", steps: ["subscribe pipeline is double opt-in (qnfo-subscribers)", "outreach suppression and opt-out always apply"] },
  { name: "web-perf", kw: "performance lighthouse core web vitals lcp cls slow page speed", what: "Audit and fix page load and interaction performance.", steps: ["measure first (Lighthouse, RUM)", "fix the largest LCP element and layout shifts", "re-measure the same page"] },
  { name: "undo-agent-pr", kw: "undo revert rollback agent pr merge mistake one-tap", what: "Revert a merged agent pull request.", steps: ["open the Undo an agent merge panel on fleet.qnfo.org/cmd (lists recent merged agent PRs with an Undo button)", "Undo opens a revert PR through GitHub revertPullRequest; the lane merges it", "a control-plane deploy also has the canary auto-revert"] },
  { name: "task-list", kw: "task list todo plan steps progress session reload resume", what: "Read a code session's persistent task list.", steps: ["open the Code session plan panel on fleet.qnfo.org/cmd (shows the latest session list)", "the agent updates it with update_task as steps finish"] }
];
const STOP = new Set(["the", "a", "an", "to", "of", "for", "in", "on", "and", "or", "how", "do", "i", "my", "with", "is", "it", "what", "can", "me", "use"]);
export function skillTokens(text) {
  return String(text == null ? "" : text).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
}
// Score: a name hit 6, keyword hit 3, description hit 2, steps hit 1 per query token; a prefix match counts half. Zero-score skills are dropped.
export function skillSearch(query, skills, limit) {
  const list = Array.isArray(skills) ? skills : FLEET_SKILLS;
  const q = skillTokens(query);
  if (!q.length) return [];
  const out = [];
  const hit = (arr, w, t) => {
    if (arr.indexOf(t) >= 0) return w;
    for (const x of arr) if (x.length > 3 && t.length > 3 && (x.startsWith(t) || t.startsWith(x))) return w / 2;
    return 0;
  };
  for (const s of list) {
    const name = skillTokens(s.name), kw = skillTokens(s.kw), what = skillTokens(s.what), steps = skillTokens((s.steps || []).join(" "));
    let score = 0;
    for (const t of q) score += hit(name, 6, t) + hit(kw, 3, t) + hit(what, 2, t) + hit(steps, 1, t);
    if (score > 0) out.push({ name: s.name, what: s.what, steps: s.steps || [], score });
  }
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
}
export function skillGet(name, skills) {
  const n = String(name == null ? "" : name).toLowerCase().trim();
  return (Array.isArray(skills) ? skills : FLEET_SKILLS).find((s) => s.name === n) || null;
}

// TASKLIST-1 (issue 9673): the persistent task list of a code session. Tasks come from the approved plan's steps and the agent moves them with update_task.
export const TASK_STATUSES = ["todo", "doing", "done"];
export function tasksFromPlan(steps) {
  return (Array.isArray(steps) ? steps : []).map((s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 12).map((title, i) => ({ id: i + 1, title: title.slice(0, 300), status: "todo" }));
}
export function taskUpdate(input) {
  const i = input && typeof input === "object" ? input : {};
  const id = Number(i.id), status = String(i.status || "");
  if (!Number.isInteger(id) || id < 1 || id > 12) return { error: "id is the task number, 1 to 12" };
  if (TASK_STATUSES.indexOf(status) < 0) return { error: "status is todo, doing or done" };
  return { id, status };
}
export function taskSummary(tasks) {
  const t = Array.isArray(tasks) ? tasks : [];
  return { total: t.length, done: t.filter((x) => x.status === "done").length, doing: t.filter((x) => x.status === "doing").length };
}
