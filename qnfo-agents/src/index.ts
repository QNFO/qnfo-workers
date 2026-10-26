// qnfo-agents: the fleet's Cloudflare Agents SDK worker (CF-AGENTS-1, charter pillar autonomy).
//
// Owner directive 2026-10-25 (verbatim): "ALL CLOUDFLARE AGENT TOOLS AND FUNCTIONALITY SHALL BE AVAILABLE VIA THE CLOUDFLARE
// QUNIVERSE FLEET DASHBOARD: https://fleet.qnfo.org/cmd" and "THIS SHALL ALSO APPLY TO OPS ENDPOINT: I WANT FULL POWER OF ALL
// CLOUDFLARE CODING AGENTS ACROSS QUNIVERSE FLEET".
//
// What it is: one Agent class (FleetCodeAgent, a SQLite-backed Durable Object from the `agents` package) that runs coding and
// operations turns for the fleet with
//   - Workers AI through AI Gateway (createAI from agents/models/ai-sdk, gateway "default", a fallback model on error),
//   - the whole qnfo-ops tool surface (/v1/tools, TOOL-BRIDGE-1) as Code Mode functions in a Dynamic Worker sandbox
//     (@cloudflare/codemode DynamicWorkerExecutor over the LOADER binding), plus direct tools for the repository, D1 reads,
//     code-task proposals, fleet issues, schedules and MCP connections,
//   - durable execution (runFiber: a turn survives eviction and is re-run once on recovery), schedules (cron or delay),
//     callable methods for WebSocket clients, and an MCP client (addMcpServer) whose tools join the turn,
//   - an MCP server at /mcp (createMcpHandler, stateless) so any MCP client reaches the same tools.
// Who may do what (secret-free; the caller is ctx.props.caller, which only a service binding can set):
//   public  GET /, /health, /tools, and /mcp with the public repository reader only. No model call, no fleet data.
//   read    qnfo-fleet-dashboard or qnfo-ops (both verify the owner first): turns, read-only tools, D1 reads, sandbox runs.
//   write   the same callers with x-agent-scope: write (the console sends it only after a fresh owner code): every ops tool,
//           fleet issues, schedules and MCP connections. Code changes still go through the code loop as owner tasks.
//   loop    a fleet loop's request in D1 cf_agent_requests (CF-AGENTS-LOOPS-1), drained every 5 minutes: the read tools plus fleet
//           issues, code-task proposals and schedules on the requester's own instance (loop-<requester>); no mutating ops tool.
// Deploy: WRANGLER-ONLY (a new Durable Object class needs a wrangler migration); .github/workflows/deploy-qnfo-agents.yml
// deploys it with the deploy-guard lock, the fleet_deploys ledger and a /health canary that reverts a push that did not arrive.
// Source is src/; worker.js is the esbuild bundle of src/index.ts (npm run build), kept identical to deployed-current.worker.js.

import { Agent, callable, getAgentByName, routeAgentRequest } from "agents";
import { createAI } from "agents/models/ai-sdk";
import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import { z } from "zod";
import { callerOf, clip, scopeOf, codeTaskText, opsToolAllowed, readOnlySql, repoPathOk, runId, safeToolName, scheduleWhen, sliceLines, DRAIN_PER_TICK, loopInstance, validateRequest, EMPTY_TEXT, FINAL_ANSWER_ASK, lastStepText, toolTranscript } from "./lib.js";

// VERSION is the first line of the bundle (build.mjs writes `var VERSION = "<package.json version>"` there for the fleet guards).
declare var VERSION: string;
const WORKER = "qnfo-agents";
const SDK = "agents@0.30.1";
const REPO = "QNFO/qnfo-workers";
const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.7-code";
const FALLBACK_MODEL = "@cf/zai-org/glm-5.3-flash";
const MAX_STEPS = 16;
const TURN_TIMEOUT_MS = 10 * 60 * 1000;
const FINAL_ANSWER_TIMEOUT_MS = 2 * 60 * 1000;
const STALE_RUN_MIN = 20;

type Scope = "public" | "read" | "write" | "loop";
const REQUEST_STALE_MIN = 30;
interface Env {
  AI: any;
  AUDIT_DB: D1Database;
  LOADER: any;
  OPS: Fetcher;
  FleetCodeAgent: DurableObjectNamespace<FleetCodeAgent>;
}
interface RunInput { text: string; scope: Scope; caller: string; instance?: string; wait_ms?: number }
interface State { runs: number; last_run: string | null; last_status: string | null; version: string }

const CAPABILITIES = [
  "Agent Durable Object with SQLite state (FleetCodeAgent)",
  "durable turns (runFiber, re-run once after eviction)",
  "schedules: cron or delay (schedule, getSchedules, cancelSchedule)",
  "callable methods over WebSocket (/agents/fleet-code-agent/<instance>, trusted callers)",
  "MCP server at /mcp (createMcpHandler)",
  "MCP client: connect any MCP server; its tools join the turn (addMcpServer)",
  "Code Mode: the model writes JavaScript that calls the tools inside a Dynamic Worker sandbox (LOADER)",
  "Workers AI through AI Gateway with a fallback model (createAI)",
  "the qnfo-ops tool surface: Cloudflare API, D1, R2, KV, GitHub, workspace, containers, deploys (scope-gated)",
  "code changes as code-task proposals the owner files; the code loop opens and merges the PR",
  "fleet loops reach it through D1 cf_agent_requests (run, sandbox, schedule), drained every 5 minutes in the loop scope"
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" } });
}
function errText(e: unknown): string { return String((e as any)?.message || e).slice(0, 600); }
function logErr(where: string, e: unknown) { console.error(JSON.stringify({ worker: WORKER, version: VERSION, where, error: errText(e) })); }

// ---- the qnfo-ops tool surface (TOOL-BRIDGE-1). qnfo-ops trusts this worker by ctx.props.caller on /v1/tools and
// /v1/tools/call only; this worker decides read versus write before it calls (opsToolAllowed).
let opsCatalog: { at: number; tools: Array<{ name: string; description: string; parameters: any }> } | null = null;
async function opsTools(env: Env): Promise<Array<{ name: string; description: string; parameters: any }>> {
  if (opsCatalog && Date.now() - opsCatalog.at < 10 * 60 * 1000) return opsCatalog.tools;
  try {
    const r = await env.OPS.fetch("https://qnfo-ops/v1/tools", { method: "GET", signal: AbortSignal.timeout(15000) });
    const j: any = await r.json().catch(() => null);
    const tools = Array.isArray(j?.data) ? j.data.map((t: any) => { const f = t.function || t; return { name: String(f.name || ""), description: String(f.description || "").slice(0, 600), parameters: f.parameters || { type: "object", properties: {} } }; }).filter((t: any) => t.name) : [];
    if (tools.length) opsCatalog = { at: Date.now(), tools };
    return tools;
  } catch (e) { logErr("opsTools", e); return opsCatalog ? opsCatalog.tools : []; }
}
async function opsCall(env: Env, scope: Scope, name: string, args: unknown): Promise<any> {
  if (!opsToolAllowed(name, scope)) return { ok: false, error: "'" + name + "' changes the fleet: it needs the write scope (on the console: cfagent! <request>, which asks for a fresh code)" };
  try {
    const r = await env.OPS.fetch("https://qnfo-ops/v1/tools/call", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, arguments: args || {} }), signal: AbortSignal.timeout(120000) });
    const t = await r.text();
    let j: any = null;
    try { j = JSON.parse(t); } catch (e) { j = null; }
    if (!j) return { ok: false, http: r.status, error: clip(t, 800) };
    return { ok: r.ok && j.ok !== false, http: r.status, result: j.result, error: j.error || undefined };
  } catch (e) { return { ok: false, error: errText(e) }; }
}

// ---- direct tools
async function readRepoFile(input: { path: string; ref?: string; from?: number; lines?: number }) {
  if (!repoPathOk(input.path)) return { ok: false, error: "path must be relative inside " + REPO + ", e.g. qnfo-ops/worker.js" };
  const ref = /^[A-Za-z0-9._\/-]{1,120}$/.test(String(input.ref || "")) ? String(input.ref) : "main";
  const url = "https://raw.githubusercontent.com/" + REPO + "/" + ref + "/" + input.path;
  const r = await fetch(url, { headers: { "user-agent": WORKER + "/" + VERSION }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return { ok: false, http: r.status, error: r.status === 404 ? "no such file on " + ref : "GitHub raw answered " + r.status };
  return Object.assign({ ok: true, path: input.path, ref }, sliceLines(await r.text(), input.from, input.lines, 60000));
}

async function fleetSql(env: Env, sql: string) {
  const p = readOnlySql(sql, 200);
  if (p.error) return { ok: false, error: p.error };
  try {
    const r = await env.AUDIT_DB.prepare(p.sql as string).all();
    const rows = r.results || [];
    const keep = JSON.stringify(rows).length > 40000 ? rows.slice(0, 50) : rows;
    return { ok: true, rows: rows.length, shown: keep.length, results: keep };
  } catch (e) { return { ok: false, error: errText(e) }; }
}

async function fileIssue(env: Env, input: { title: string; description: string; priority?: string; category?: string }, caller: string) {
  const title = String(input.title || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const desc = String(input.description || "").trim().slice(0, 4000);
  if (title.length < 8 || desc.length < 20) return { ok: false, error: "a fleet issue needs a title (8+ characters) and a description (20+)" };
  const pr = ["critical", "high", "medium", "low"].indexOf(String(input.priority)) >= 0 ? String(input.priority) : "medium";
  // A code-task line from here would be refused by the planner (INTAKE-PROVENANCE-1: this source is not an owner request), so
  // it is neutralised; code changes go through propose_code_task, which the owner files.
  const body = (desc + "\n\nFiled by " + WORKER + " " + VERSION + " for " + caller + " (CF-AGENTS-1).").replace(/code-task:/gi, "code-task -");
  const now = Date.now();
  try {
    const r = await env.AUDIT_DB.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?6)").bind(title, body, WORKER, String(input.category || "agent").slice(0, 40), pr, now).run();
    return { ok: true, id: r.meta && r.meta.last_row_id, title, priority: pr };
  } catch (e) { return { ok: false, error: errText(e) }; }
}

interface ToolCtx { env: Env; scope: Scope; caller: string; agent: FleetCodeAgent | null; proposals: any[] }

function directTools(c: ToolCtx): Record<string, any> {
  const t: Record<string, any> = {
    repo_read_file: tool({
      description: "Read a file of the " + REPO + " repository (public) by line range. Returns numbered lines.",
      inputSchema: z.object({ path: z.string().describe("path relative to the repository root, e.g. qnfo-ops/worker.js"), ref: z.string().optional().describe("branch, tag or SHA (default main)"), from: z.number().optional().describe("first line, 1-based"), lines: z.number().optional().describe("how many lines (default 400)") }),
      execute: async (i: any) => readRepoFile(i)
    })
  };
  if (c.scope === "public") return t;
  t.fleet_sql = tool({
    description: "Read-only SQL (one SELECT or WITH) on the fleet's D1 qnfo-audit: agent_issues, v_issue_queue, code_tasks, metric_registry, v_metric_trigger_state, fleet_deploys, decision_log and the rest. Sign-in and secret tables are refused.",
    inputSchema: z.object({ sql: z.string() }),
    execute: async (i: any) => fleetSql(c.env, i.sql)
  });
  t.ops_catalog = tool({
    description: "List the qnfo-ops tools this turn may call (Cloudflare API, D1, R2, KV, GitHub, workspace, containers, deploys), with their descriptions.",
    inputSchema: z.object({ filter: z.string().optional() }),
    execute: async (i: any) => {
      const f = String(i.filter || "").toLowerCase();
      const all = await opsTools(c.env);
      return all.filter((x) => opsToolAllowed(x.name, c.scope) && (!f || (x.name + " " + x.description).toLowerCase().indexOf(f) >= 0)).map((x) => ({ name: x.name, description: x.description.slice(0, 240) }));
    }
  });
  t.ops_call = tool({
    description: "Call one qnfo-ops tool by name with its JSON arguments (see ops_catalog). Tools that change the fleet need the write scope.",
    inputSchema: z.object({ name: z.string(), arguments: z.record(z.string(), z.any()).optional() }),
    execute: async (i: any) => opsCall(c.env, c.scope, i.name, i.arguments || {})
  });
  t.propose_code_task = tool({
    description: "Propose a code change for the fleet's code loop: one repository file, what the change does, and a verbatim anchor that occurs once in that file near the edit. The owner files it with one tap; the code loop writes the patch, opens the PR and merges it on green checks.",
    inputSchema: z.object({ path: z.string(), goal: z.string(), anchor: z.string().optional() }),
    execute: async (i: any) => {
      const r = codeTaskText(i);
      if (r.error) return { ok: false, error: r.error };
      c.proposals.push({ kind: "code-task", path: i.path, goal: String(i.goal).slice(0, 300), task_text: r.text });
      return { ok: true, proposed: true, note: "Returned to the caller as a code-task proposal." };
    }
  });
  if (c.scope !== "write" && c.scope !== "loop") return t;
  t.file_issue = tool({
    description: "File a fleet issue in qnfo-audit.agent_issues (a defect or follow-up for the fleet's loops).",
    inputSchema: z.object({ title: z.string(), description: z.string(), priority: z.enum(["critical", "high", "medium", "low"]).optional(), category: z.string().optional() }),
    execute: async (i: any) => fileIssue(c.env, i, c.caller)
  });
  if (c.agent) {
    const agent = c.agent;
    t.schedule_turn = tool({
      description: "Schedule a later agent turn on this agent: a five-field cron (at most every 5 minutes) or a delay in seconds.",
      inputSchema: z.object({ text: z.string(), cron: z.string().optional(), delay_s: z.number().optional() }),
      execute: async (i: any) => agent.createSchedule({ text: i.text, cron: i.cron, delay_s: i.delay_s, scope: c.scope, caller: c.caller })
    });
    if (c.scope !== "write") return t;
    t.mcp_connect = tool({
      description: "Connect this agent to a remote MCP server by URL (Streamable HTTP); its tools join later turns.",
      inputSchema: z.object({ name: z.string(), url: z.string() }),
      execute: async (i: any) => agent.connectMcp(i.name, i.url)
    });
  }
  return t;
}

// Code Mode: one tool through which the model writes JavaScript that calls every direct tool and every allowed qnfo-ops tool as
// codemode.<name>(args), run in a Dynamic Worker with no outbound network of its own.
async function codeModeTool(c: ToolCtx, direct: Record<string, any>) {
  const fns: Record<string, any> = {};
  for (const k of Object.keys(direct)) fns[k] = direct[k];
  for (const o of await opsTools(c.env)) {
    if (!opsToolAllowed(o.name, c.scope)) continue;
    const n = safeToolName("ops_" + o.name);
    if (fns[n]) continue;
    fns[n] = tool({ description: o.description, inputSchema: jsonSchema(o.parameters || { type: "object", properties: {} }) as any, execute: async (args: any) => opsCall(c.env, c.scope, o.name, args) });
  }
  const executor = new DynamicWorkerExecutor({ loader: c.env.LOADER, timeout: 120000, globalOutbound: null } as any);
  return createCodeTool({ tools: fns as any, executor, description: "Run JavaScript in an isolated sandbox. Inside it, every fleet tool is an async function on `codemode` (codemode.repo_read_file, codemode.fleet_sql, codemode.ops_<qnfo-ops tool>, ...). Use it to chain several calls, loop over results or compute; return the value you want back." } as any);
}

async function allTools(c: ToolCtx) {
  const direct = directTools(c);
  const tools: Record<string, any> = Object.assign({}, direct);
  if (c.scope !== "public" && c.env.LOADER) {
    try { tools.codemode = await codeModeTool(c, direct); } catch (e) { logErr("codemode", e); }
  }
  if (c.agent && c.scope !== "public") {
    try { await c.agent.mcp.waitForConnections?.({ timeout: 5000 } as any); } catch (e) { /* connections still coming up */ }
    try { Object.assign(tools, c.agent.mcp.getAITools()); } catch (e) { logErr("mcp-tools", e); }
  }
  return tools;
}

const SYSTEM = [
  "You are the Quniverse fleet's coding and operations agent (" + WORKER + ", Cloudflare Agents SDK), working on the " + REPO + " repository: about 40 Cloudflare Workers, the D1 database qnfo-audit, and the loops that run them.",
  "Work from evidence: read the code (repo_read_file, or codemode with ops_workspace_grep / ops_github_repo_read), the fleet graph (ops_fleet_graph impact before any change to a binding, table or route), and D1 (fleet_sql). Say what you read.",
  "Code changes go through the fleet's code loop: call propose_code_task with one file, the goal, and a verbatim anchor that occurs exactly once in that file. Never paste a patch as the only record.",
  "Use codemode when a task needs several tool calls, loops or computation. A tool that refuses (scope, guard, permission) is reported plainly with its reason; never retry it under another name.",
  "Never print a secret, token or key. Keep the final answer short: what you found, what you did, what is proposed, and what is open."
].join("\n");

async function modelFor(env: Env) {
  let id = DEFAULT_MODEL, fb = FALLBACK_MODEL;
  try {
    const row: any = await env.AUDIT_DB.prepare("SELECT value FROM ops_config WHERE key = 'qnfo_agents_model'").first();
    if (row && /^@cf\/[a-z0-9._\/-]{3,120}$/i.test(String(row.value))) id = String(row.value);
  } catch (e) { /* ops_config unreadable: the default model */ }
  const ai = createAI({ binding: env.AI, id: "default", metadata: { worker: WORKER } } as any);
  return { id, model: (ai as any)(id, { fallback: [fb] }) };
}

async function ledger(env: Env, row: Record<string, unknown>) {
  try {
    await env.AUDIT_DB.prepare("INSERT OR REPLACE INTO cf_agent_runs (id, instance, caller, scope, status, model, steps, tools_used, prompt, result, error, created_ms, finished_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)")
      .bind(row.id, row.instance, row.caller, row.scope, row.status, row.model ?? null, row.steps ?? 0, row.tools_used ?? null, clip(String(row.prompt || ""), 2000), row.result == null ? null : clip(String(row.result), 8000), row.error ?? null, row.created_ms, row.finished_ms ?? null).run();
    // A turn whose Durable Object never finished it (the agent sweeps its own SQLite in onStart) is closed here too.
    await env.AUDIT_DB.prepare("UPDATE cf_agent_runs SET status = 'failed', error = 'abandoned: no progress for " + STALE_RUN_MIN + " minutes', finished_ms = ?1 WHERE status IN ('queued', 'running') AND created_ms < ?2").bind(Date.now(), Date.now() - STALE_RUN_MIN * 60000).run();
  } catch (e) { logErr("ledger", e); }
}

export class FleetCodeAgent extends Agent<Env, State> {
  initialState: State = { runs: 0, last_run: null, last_status: null, version: VERSION };

  async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, prompt TEXT, scope TEXT, caller TEXT, status TEXT, attempts INTEGER DEFAULT 0, model TEXT, steps INTEGER DEFAULT 0, tools_used TEXT, result TEXT, proposals TEXT, error TEXT, created_ms INTEGER, finished_ms INTEGER)`;
    const cut = Date.now() - STALE_RUN_MIN * 60000;
    const why = "abandoned: no progress for " + STALE_RUN_MIN + " minutes";
    this.sql`UPDATE runs SET status = 'failed', error = ${why}, finished_ms = ${Date.now()} WHERE status IN ('queued', 'running') AND created_ms < ${cut}`;
  }

  private row(id: string): any {
    const r = this.sql`SELECT * FROM runs WHERE id = ${id}`;
    const x: any = r[0];
    if (!x) return null;
    try { x.proposals = x.proposals ? JSON.parse(x.proposals) : []; } catch (e) { x.proposals = []; }
    return x;
  }

  // Start a turn as a durable fiber and return at once, or wait up to wait_ms for it to finish.
  async startRun(input: RunInput) {
    const text = String(input.text || "").trim().slice(0, 8000);
    if (!text) return { ok: false, error: "empty request" };
    const scope: Scope = input.scope === "write" || input.scope === "loop" ? input.scope : "read";
    const id = runId();
    const now = Date.now();
    this.sql`INSERT INTO runs (id, prompt, scope, caller, status, created_ms) VALUES (${id}, ${text}, ${scope}, ${input.caller}, 'queued', ${now})`;
    await ledger(this.env, { id, instance: this.name, caller: input.caller, scope, status: "queued", prompt: text, created_ms: now });
    const done = this.runFiber("turn:" + id, async (fctx: any) => {
      fctx.stash({ id });
      await this.executeRun(id);
    }).catch((e) => logErr("fiber", e));
    const wait = Math.max(0, Math.min(25000, Number(input.wait_ms) || 0));
    if (wait) await Promise.race([done, new Promise((r) => setTimeout(r, wait))]);
    return { ok: true, run: this.row(id) };
  }

  async onFiberRecovered(ctx: any) {
    const id = ctx && ctx.stash && ctx.stash.id;
    if (!id) return;
    const r = this.row(id);
    if (!r || r.status === "done" || r.status === "failed") return;
    if ((r.attempts || 0) >= 2) {
      this.sql`UPDATE runs SET status = 'failed', error = 'evicted twice mid-turn', finished_ms = ${Date.now()} WHERE id = ${id}`;
      return;
    }
    void this.runFiber("turn:" + id, async (fctx: any) => { fctx.stash({ id }); await this.executeRun(id); });
  }

  async executeRun(id: string) {
    const r = this.row(id);
    if (!r) return;
    this.sql`UPDATE runs SET status = 'running', attempts = attempts + 1 WHERE id = ${id}`;
    const proposals: any[] = [];
    let status = "done", result = "", error: string | null = null, steps = 0, used: string[] = [], modelId = DEFAULT_MODEL;
    try {
      const m = await modelFor(this.env);
      modelId = m.id;
      const tools = await allTools({ env: this.env, scope: r.scope, caller: r.caller, agent: this, proposals });
      const out: any = await generateText({ model: m.model, system: SYSTEM + "\nScope of this turn: " + r.scope + ".", prompt: r.prompt, tools, stopWhen: stepCountIs(MAX_STEPS), abortSignal: AbortSignal.timeout(TURN_TIMEOUT_MS) } as any);
      result = String(out.text || "").trim() || lastStepText(out.steps);
      steps = Array.isArray(out.steps) ? out.steps.length : 0;
      for (const s of out.steps || []) for (const tc of s.toolCalls || []) if (used.indexOf(tc.toolName) < 0) used.push(tc.toolName);
      // EMPTY-TURN-ANSWER-1: no step wrote text, so one more call without tools turns what the tools returned into the answer.
      if (!result) {
        try {
          const fin: any = await generateText({ model: m.model, system: SYSTEM + "\nScope of this turn: " + r.scope + ".", prompt: "Request:\n" + clip(r.prompt, 6000) + "\n\nTool results so far:\n" + (toolTranscript(out.steps, 24000) || "(none)") + "\n\n" + FINAL_ANSWER_ASK, abortSignal: AbortSignal.timeout(FINAL_ANSWER_TIMEOUT_MS) } as any);
          result = String(fin.text || "").trim();
          if (result) used.push("final-answer");
        } catch (eF) { logErr("final-answer", eF); }
      }
      result = result || EMPTY_TEXT;
    } catch (e) {
      status = "failed";
      error = errText(e);
    }
    const fin = Date.now();
    this.sql`UPDATE runs SET status = ${status}, model = ${modelId}, steps = ${steps}, tools_used = ${used.join(",")}, result = ${result}, proposals = ${JSON.stringify(proposals)}, error = ${error}, finished_ms = ${fin} WHERE id = ${id}`;
    this.setState({ runs: (this.state.runs || 0) + 1, last_run: id, last_status: status, version: VERSION });
    await ledger(this.env, { id, instance: this.name, caller: r.caller, scope: r.scope, status, model: modelId, steps, tools_used: used.join(","), prompt: r.prompt, result: result + (proposals.length ? "\n\nproposals: " + JSON.stringify(proposals) : ""), error, created_ms: r.created_ms, finished_ms: fin });
  }

  getRun(id: string) { return this.row(String(id)); }
  listRuns(limit = 20) {
    const n = Math.max(1, Math.min(100, Number(limit) || 20));
    return this.sql`SELECT id, status, scope, caller, model, steps, tools_used, substr(prompt, 1, 160) AS prompt, substr(result, 1, 240) AS result, error, created_ms, finished_ms FROM runs ORDER BY created_ms DESC LIMIT ${n}`;
  }

  // Schedules: each fires scheduledTurn with the stored request.
  async createSchedule(input: { text: string; cron?: string; delay_s?: number; scope: Scope; caller: string }) {
    const w = scheduleWhen(input);
    if (w.error) return { ok: false, error: w.error };
    const text = String(input.text || "").trim().slice(0, 4000);
    if (text.length < 8) return { ok: false, error: "say what the scheduled turn should do" };
    const s = await this.schedule(w.when as any, "scheduledTurn" as any, { text, scope: input.scope === "write" || input.scope === "loop" ? input.scope : "read", caller: input.caller });
    return { ok: true, id: s.id, kind: w.kind, when: w.when };
  }
  async scheduledTurn(payload: { text: string; scope: Scope; caller: string }) {
    await this.startRun({ text: payload.text, scope: payload.scope, caller: payload.caller + " (schedule)" });
  }
  listSchedules() { return this.getSchedules().map((s: any) => ({ id: s.id, type: s.type, cron: s.cron, time: s.time, payload: s.payload })); }
  async dropSchedule(id: string) { return { ok: await this.cancelSchedule(String(id)) }; }

  // MCP client.
  async connectMcp(name: string, url: string) {
    if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/\S*$/.test(String(url))) return { ok: false, error: "an https URL of a remote MCP server" };
    try {
      const r: any = await this.addMcpServer(String(name).slice(0, 60), String(url));
      return { ok: true, id: r.id, state: r.state, auth_url: r.authUrl || undefined };
    } catch (e) { return { ok: false, error: errText(e) }; }
  }
  mcpServers() { return this.getMcpServers(); }
  async disconnectMcp(id: string) { await this.removeMcpServer(String(id)); return { ok: true }; }

  // Code Mode without a model: run the given JavaScript in the sandbox with the tools of the scope.
  async sandbox(code: string, scope: Scope, caller: string) {
    const c: ToolCtx = { env: this.env, scope, caller, agent: this, proposals: [] };
    const direct = directTools(c);
    const fns: Record<string, (a: any) => Promise<unknown>> = {};
    for (const k of Object.keys(direct)) fns[k] = (a: any) => direct[k].execute(a || {}, { toolCallId: "sandbox", messages: [] });
    for (const o of await opsTools(this.env)) if (opsToolAllowed(o.name, scope)) fns[safeToolName("ops_" + o.name)] = (a: any) => opsCall(this.env, scope, o.name, a || {});
    const ex = new DynamicWorkerExecutor({ loader: this.env.LOADER, timeout: 60000, globalOutbound: null } as any);
    const r = await ex.execute(String(code || "async () => null"), fns as any);
    return { ok: !r.error, result: r.result, error: r.error, logs: r.logs, proposals: c.proposals };
  }

  // WebSocket clients (useAgent / AgentClient) reach the same work through callable methods.
  @callable() async run(text: string) { return this.startRun({ text, scope: "read", caller: "websocket" }); }
  @callable() runs() { return this.listRuns(20); }
  @callable() status(id: string) { return this.getRun(id); }
  @callable() schedules() { return this.listSchedules(); }
}

// ---- CF-AGENTS-LOOPS-1: the D1 request queue any fleet loop writes (cf_agent_requests), drained by the 5-minute cron.
const NOW_SQL = "strftime('%Y-%m-%dT%H:%M:%SZ','now')";
async function finishRequest(env: Env, id: number, status: string, result: unknown, error: string | null) {
  await env.AUDIT_DB.prepare("UPDATE cf_agent_requests SET status = ?2, result = ?3, error = ?4, finished_at = " + NOW_SQL + " WHERE id = ?1")
    .bind(id, status, result == null ? null : clip(typeof result === "string" ? result : JSON.stringify(result), 8000), error ? clip(error, 600) : null).run();
}

async function drainRequests(env: Env) {
  const db = env.AUDIT_DB;
  const out = { reconciled: 0, started: 0, failed: 0 };
  // 1. A running turn is finished when its cf_agent_runs row is; one with no result after REQUEST_STALE_MIN is re-queued (twice at
  //    most) and then failed with the reason, so nothing waits silently.
  const running: any = await db.prepare("SELECT q.id, q.attempts, q.started_at, a.status AS run_status, a.result AS run_result, a.error AS run_error FROM cf_agent_requests q LEFT JOIN cf_agent_runs a ON a.id = q.run_id WHERE q.status = 'running' LIMIT 50").all();
  for (const r of running.results || []) {
    if (r.run_status === "done" || r.run_status === "failed") { await finishRequest(env, r.id, r.run_status, r.run_result, r.run_error); out.reconciled++; continue; }
    const age = (Date.now() - Date.parse(String(r.started_at || ""))) / 60000;
    if (!(age > REQUEST_STALE_MIN)) continue;
    if ((r.attempts || 0) < 2) await db.prepare("UPDATE cf_agent_requests SET status = 'queued', run_id = NULL, error = ?2 WHERE id = ?1").bind(r.id, "re-queued: no result after " + REQUEST_STALE_MIN + " minutes").run();
    else { await finishRequest(env, r.id, "failed", null, "no result after " + REQUEST_STALE_MIN + " minutes, " + r.attempts + " attempts"); out.failed++; }
  }
  // 2. Start the next requests, critical first, then oldest.
  const queued: any = await db.prepare("SELECT * FROM cf_agent_requests WHERE status = 'queued' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, id LIMIT ?1").bind(DRAIN_PER_TICK).all();
  for (const q of queued.results || []) {
    const claim = await db.prepare("UPDATE cf_agent_requests SET status = 'running', attempts = attempts + 1, started_at = " + NOW_SQL + " WHERE id = ?1 AND status = 'queued'").bind(q.id).run();
    if (!claim.meta || !claim.meta.changes) continue;
    const v = validateRequest(q);
    if (v.error) { await finishRequest(env, q.id, "failed", null, v.error); out.failed++; continue; }
    const caller = "loop:" + q.requester;
    try {
      const stub: any = await getAgentByName(env.FleetCodeAgent as any, loopInstance(q.requester, q.instance));
      if (v.kind === "run") {
        const r = await stub.startRun({ text: q.prompt, scope: "loop", caller, wait_ms: 0 });
        if (!r.ok || !r.run) { await finishRequest(env, q.id, "failed", null, String(r.error || "the agent did not start the turn")); out.failed++; continue; }
        await db.prepare("UPDATE cf_agent_requests SET run_id = ?2 WHERE id = ?1").bind(q.id, r.run.id).run();
      } else if (v.kind === "sandbox") {
        const r = await stub.sandbox(String(q.code), "loop", caller);
        await finishRequest(env, q.id, r.ok ? "done" : "failed", { result: r.result, logs: r.logs, proposals: r.proposals }, r.error ? String(r.error) : null);
      } else {
        const r = await stub.createSchedule({ text: q.prompt, cron: q.cron || undefined, delay_s: q.delay_s || undefined, scope: "loop", caller });
        await finishRequest(env, q.id, r.ok ? "done" : "failed", r, r.ok ? null : String(r.error));
      }
      out.started++;
    } catch (e) {
      await finishRequest(env, q.id, "failed", null, errText(e));
      out.failed++;
    }
  }
  return out;
}

// ---- MCP server (stateless). Public clients get the repository reader; trusted callers get the scope's tools and the agent.
function mcpServer(env: Env, scope: Scope, caller: string) {
  const server = new McpServer({ name: WORKER, version: VERSION });
  const c: ToolCtx = { env, scope, caller: caller || "mcp-public", agent: null, proposals: [] };
  const tools = directTools(c);
  for (const name of Object.keys(tools)) {
    const t = tools[name];
    server.registerTool(name, { description: t.description, inputSchema: t.inputSchema } as any, (async (args: any) => {
      const out = await t.execute(args || {}, { toolCallId: "mcp", messages: [] });
      return { content: [{ type: "text", text: clip(out, 60000) }] };
    }) as any);
  }
  if (scope !== "public") {
    server.registerTool("agent_run", { description: "Start a turn of the fleet coding agent and wait up to 25 s; returns the run (poll agent_status with its id).", inputSchema: z.object({ text: z.string(), instance: z.string().optional() }) } as any, (async (a: any) => {
      const stub: any = await getAgentByName(env.FleetCodeAgent as any, instanceName(a.instance));
      const r = await stub.startRun({ text: a.text, scope, caller: caller + " (mcp)", wait_ms: 25000 });
      return { content: [{ type: "text", text: clip(r, 60000) }] };
    }) as any);
    server.registerTool("agent_status", { description: "Read one agent run by id.", inputSchema: z.object({ id: z.string(), instance: z.string().optional() }) } as any, (async (a: any) => {
      const stub: any = await getAgentByName(env.FleetCodeAgent as any, instanceName(a.instance));
      return { content: [{ type: "text", text: clip(await stub.getRun(a.id), 60000) }] };
    }) as any);
  }
  return server;
}

function instanceName(s: unknown): string {
  const n = String(s || "fleet").toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,40}$/.test(n) ? n : "fleet";
}

async function body(request: Request): Promise<any> {
  try { return await request.json(); } catch (e) { return {}; }
}

function selfDoc(caller: string, scope: Scope) {
  return {
    worker: WORKER, version: VERSION, sdk: SDK, ok: true, you: { caller: caller || null, scope },
    what: "The fleet's Cloudflare Agents SDK agent: coding and operations turns over the whole fleet tool surface, durable, schedulable, with an MCP server and client and a Code Mode sandbox.",
    capabilities: CAPABILITIES,
    model: { primary: DEFAULT_MODEL, fallback: FALLBACK_MODEL, via: "Workers AI binding through AI Gateway 'default'", override: "ops_config qnfo_agents_model" },
    routes: {
      open: ["GET /", "GET /health", "GET /tools", "POST /mcp (public: repo_read_file)"],
      loops: ["INSERT INTO qnfo-audit.cf_agent_requests (requester, kind run|sandbox|schedule, prompt | code, cron | delay_s, instance?, priority?): drained every 5 minutes, outcome written back to the row"],
      trusted: ["GET /requests?status=&requester=", "POST /requests/drain", "POST /run {text, instance?, wait_ms?}", "GET /runs", "GET /runs/<id>", "GET /schedules", "POST /schedules {text, cron|delay_s}", "DELETE /schedules/<id>", "GET /mcp-servers", "POST /mcp-servers {name, url}", "DELETE /mcp-servers/<id>", "POST /sandbox {code}", "/agents/fleet-code-agent/<instance> (WebSocket, callable methods)"]
    },
    surfaces: { console: "https://fleet.qnfo.org/cmd (cfagent <request>, cfagent! <request> for the write scope)", ops: "https://ops.qnfo.org/v1/agents/..." }
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    const caller = callerOf(ctx);
    const scope = scopeOf(caller, request.headers.get("x-agent-scope")) as Scope;
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, accept" } });
      if (path === "/health") return json({ ok: true, worker: WORKER, version: VERSION, sdk: SDK, ts: new Date().toISOString() });
      if (path === "/" && request.method === "GET") return json(selfDoc(caller, scope));
      if (path === "/tools" && request.method === "GET") {
        const c: ToolCtx = { env, scope: caller ? "write" : "public", caller, agent: null, proposals: [] };
        const d = directTools(c);
        const ops = caller ? (await opsTools(env)).map((o) => ({ name: "ops_" + o.name, readonly: opsToolAllowed(o.name, "read"), description: o.description.slice(0, 200) })) : [];
        return json({ ok: true, version: VERSION, direct: Object.keys(d).map((k) => ({ name: k, description: d[k].description })), codemode: caller ? "every tool below is also codemode.<name>() in the sandbox" : null, ops_tools: ops, mcp: "POST /mcp" });
      }
      if (path === "/mcp") return createMcpHandler(() => mcpServer(env, scope, caller) as any, { route: "/mcp" } as any)(request, env, ctx);
      if (!caller) return json({ ok: false, error: "This route is for the fleet console and the ops endpoint. Use https://fleet.qnfo.org/cmd (cfagent <request>) or https://ops.qnfo.org/v1/agents.", open: ["/", "/health", "/tools", "/mcp"] }, 403);
      if (path.indexOf("/agents/") === 0) return (await routeAgentRequest(request, env)) || json({ ok: false, error: "no such agent" }, 404);
      const b = request.method === "POST" ? await body(request) : {};
      const stub: any = await getAgentByName(env.FleetCodeAgent as any, instanceName(b.instance || url.searchParams.get("instance")));
      if (path === "/run" && request.method === "POST") return json(await stub.startRun({ text: b.text, scope, caller, wait_ms: b.wait_ms }));
      if (path === "/runs" && request.method === "GET") return json({ ok: true, runs: await stub.listRuns(Number(url.searchParams.get("limit")) || 20) });
      let m: RegExpExecArray | null;
      if ((m = /^\/runs\/(run_[a-z0-9_]{6,60})$/.exec(path)) && request.method === "GET") { const r = await stub.getRun(m[1]); return r ? json({ ok: true, run: r }) : json({ ok: false, error: "no such run" }, 404); }
      if (path === "/schedules" && request.method === "GET") return json({ ok: true, schedules: await stub.listSchedules() });
      if (scope !== "write" && (request.method === "DELETE" || path === "/schedules" || path === "/mcp-servers")) return json({ ok: false, error: "schedules and MCP connections change the agent: they need the write scope (cfagent! on the console)" }, 403);
      if (path === "/schedules" && request.method === "POST") return json(await stub.createSchedule({ text: b.text, cron: b.cron, delay_s: b.delay_s, scope, caller }));
      if ((m = /^\/schedules\/([A-Za-z0-9_-]{4,80})$/.exec(path)) && request.method === "DELETE") return json(await stub.dropSchedule(m[1]));
      if (path === "/mcp-servers" && request.method === "GET") return json({ ok: true, servers: await stub.mcpServers() });
      if (path === "/mcp-servers" && request.method === "POST") return json(await stub.connectMcp(b.name, b.url));
      if ((m = /^\/mcp-servers\/([A-Za-z0-9_-]{4,80})$/.exec(path)) && request.method === "DELETE") return json(await stub.disconnectMcp(m[1]));
      if (path === "/sandbox" && request.method === "POST") return json(await stub.sandbox(String(b.code || ""), scope, caller));
      // The second path for the 5-minute cron (spof_registry 'qnfo-agents cron */5'): a trusted caller drains the queue on demand.
      if (path === "/requests/drain" && request.method === "POST") return json({ ok: true, ...(await drainRequests(env)) });
      if (path === "/requests" && request.method === "GET") {
        const st = String(url.searchParams.get("status") || ""), rq = String(url.searchParams.get("requester") || "");
        const r: any = await env.AUDIT_DB.prepare("SELECT id, requester, kind, priority, status, attempts, run_id, substr(coalesce(prompt, code), 1, 200) AS request, substr(result, 1, 600) AS result, error, created_at, started_at, finished_at FROM cf_agent_requests WHERE (?1 = '' OR status = ?1) AND (?2 = '' OR requester = ?2) ORDER BY id DESC LIMIT 30").bind(st, rq).all();
        return json({ ok: true, requests: r.results || [] });
      }
      return json({ ok: false, error: "no such route", routes: selfDoc(caller, scope).routes }, 404);
    } catch (e) {
      logErr("fetch " + path, e);
      return json({ ok: false, error: errText(e) }, 500);
    }
  },

  // CF-AGENTS-LOOPS-1: every 5 minutes, drain the loops' request queue.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(drainRequests(env).then((r) => console.log(JSON.stringify({ worker: WORKER, version: VERSION, where: "drain", ...r }))).catch((e) => logErr("drain", e)));
  }
};
