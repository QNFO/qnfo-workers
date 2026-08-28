var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// agent-orchestrator.js
import { DurableObject } from "cloudflare:workers";
var SYSTEM_PROMPT = `You are QNFO, the research agent for QNFO (research) and QWAV (commercial quantum solutions), founded by Rowan Brad Quni-Gudzinas. You run on Cloudflare Workers against the QNFO knowledge infrastructure: the living-paper corpus (D1 + Vectorize semantic index), the knowledge graph (D1), and the R2 projects store.

MISSION
The program's core mission is the energy-efficiency benchmark for quantum computing: answering "What does a correct quantum answer cost in energy?" (JPCUB, joules-per-solution; grounded in Landauer, Margolus-Levitin, and Bremermann limits; anti-gaming discipline). Supporting pillars: ultrametric physics, laws of form, infomatics, consilience research, and the QWAV platform. Every answer you produce should serve that mission: open, reproducible, energy-first, and valuable to an external reader.

PRIORITIES (attention selectivity)
1. Core strategy: the JPCUB energy benchmark and its validation.
2. Program pillars feeding the benchmark (ultrametric physics, laws of form, infomatics, research archive, platform, demos).
3. Active registry research programs.
4. Operations support (run the machine, do not expand it).
5. External noise: do not engage.
Surface only mission-relevant findings; do not spend effort on topics outside these priorities.

RESEARCH METHOD
- Gather evidence with the tools before answering. Try multiple query formulations; validate cross-system identifiers (slug, DOI).
- Prefer primary sources (corpus, knowledge graph) over assumptions. Cite specific papers by slug and DOI when known.
- Verify quantitative or statistical claims computationally where possible; state the method used.
- State uncertainty explicitly; for any strong claim, note what would disconfirm it.
- Audit before asserting; disclose rather than conceal; verify provenance.

OUTPUT STANDARDS (hard)
- Plain scholarly prose for a human reader. No meta-commentary about the act of writing, no self-praise ("rigorous", "honest"), no signpost overload, no cliches ("delve", "tapestry", "landscape").
- State the fact and stop; the citation carries the evidence.
- No navel-gazing: the output must be useful to an external reader, never a summary of internal pipeline status.
- Final answer: plain Markdown, no tool calls, no raw tool JSON.

TOOLS
- search_papers(query, limit?): semantic search across the QWAV research corpus. Returns paper slugs, scores, and metadata.
- get_paper_context(slug): full body text of a specific paper.
- query_graph(sql): read-only SQL against the QNFO knowledge graph. Tables: nodes(id, name, label, properties), edges(source_id, target_id, label, properties).

When you have enough evidence, answer directly in Markdown. Do not make additional tool calls in the final response.`;
var TOOLS = [
  {
    type: "function",
    function: {
      name: "search_papers",
      description: "Semantic search across the QWAV research paper corpus using vector embeddings. Returns paper slugs, scores, and metadata.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language search query" },
          limit: { type: "integer", description: "Max results (1-10, default 5)", default: 5 }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_paper_context",
      description: "Get the full body text of a specific paper by its slug identifier.",
      parameters: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Paper slug (e.g., 'zbw-p5-capstone')" }
        },
        required: ["slug"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "query_graph",
      description: "Run a read-only SQL query against the QNFO knowledge graph (D1). Tables: nodes(id, name, label, properties JSON), edges(source_id, target_id, label, properties JSON).",
      parameters: {
        type: "object",
        properties: {
          sql: { type: "string", description: "SQL SELECT query (read-only)" }
        },
        required: ["sql"]
      }
    }
  }
];
var AgentTask = class extends DurableObject {
  static {
    __name(this, "AgentTask");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const taskId = url.pathname.split("/").pop();
    if (url.pathname.endsWith("/start") && request.method === "POST") {
      const { prompt, maxSteps = 5 } = await request.json();
      const state = {
        id: taskId,
        status: "running",
        prompt,
        maxSteps,
        step: 0,
        messages: [],
        result: null,
        error: null,
        createdAt: Date.now(),
        completedAt: null
      };
      await this.ctx.storage.put("state", state);
      await this.ctx.storage.setAlarm(Date.now() + 30 * 60 * 1e3);
      this.ctx.waitUntil(this.runAgentLoop(taskId));
      return Response.json({ task_id: taskId, status: "running" });
    }
    if (url.pathname.endsWith("/alarm") && request.method === "GET") {
      await this.alarm();
      return Response.json({ ok: true });
    }
    if (url.pathname.endsWith("/status")) {
      const state = await this.ctx.storage.get("state");
      return Response.json(state || { error: "Task not found" });
    }
    return new Response("Not found", { status: 404 });
  }
  // ── Watchdog: called by the runtime when the alarm fires ──
  // If the agent loop never completed (DO eviction / crash / hang), mark the
  // task failed so polling returns a terminal state instead of "running" forever.
  async alarm() {
    const state = await this.ctx.storage.get("state");
    if (state && state.status === "running") {
      state.status = "failed";
      state.error = "Task timed out: agent loop exceeded 30-minute watchdog";
      state.completedAt = Date.now();
      await this.ctx.storage.put("state", state);
      console.log(`[watchdog] task ${state.id} marked failed after 30min`);
    }
  }
  // ── Agent loop ───────────────────────────────────────────
  async runAgentLoop(taskId) {
    const state = await this.ctx.storage.get("state");
    if (!state) return;
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: state.prompt }
    ];
    try {
      for (let i = 0; i < state.maxSteps; i++) {
        state.step = i + 1;
        await this.ctx.storage.put("state", state);
        const aiResponse = await this.env.AI.run(
          "@cf/qwen/qwen2.5-coder-32b-instruct",
          {
            messages,
            tools: TOOLS,
            tool_choice: "auto",
            max_tokens: 4096,
            temperature: 0.3
          }
        );
        const rawToolCalls = aiResponse.tool_calls || [];
    // qwen2.5-coder quirk: tool call may arrive as an OBJECT (or JSON string) in `response`
    const respVal = aiResponse.response;
    if (rawToolCalls.length === 0 && respVal) {
      let candidate = null;
      if (typeof respVal === "object" && respVal.name && respVal.arguments) {
        candidate = respVal;
      } else if (typeof respVal === "string") {
        let jsonStr = respVal.trim();
        const m = jsonStr.match(/<(?:tools|tool_response)>([\s\S]*?)<\/(?:tools|tool_response)>/);
        if (m) jsonStr = m[1].trim();
        if (jsonStr.startsWith("{")) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.name && parsed.arguments) candidate = parsed;
          } catch (e) {}
        }
      }
      if (candidate) rawToolCalls.push(candidate);
    }
        const toolCalls = rawToolCalls.map((tc) => {
          let fnName, fnArgs;
          if (tc.function) {
            fnName = tc.function.name;
            fnArgs = typeof tc.function.arguments === "string" ? tc.function.arguments : JSON.stringify(tc.function.arguments || {});
          } else if (tc.name) {
            fnName = tc.name;
            fnArgs = typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments || {});
          } else {
            return null;
          }
          return {
            id: tc.id || `call_${crypto.randomUUID().slice(0, 8)}`,
            type: "function",
            function: { name: fnName, arguments: fnArgs }
          };
        }).filter(Boolean);
        if (toolCalls.length === 0) {
          state.status = "completed";
          state.result = aiResponse.response || aiResponse.content || JSON.stringify(aiResponse);
          state.completedAt = Date.now();
          state.messages = messages;
          await this.ctx.storage.put("state", state);
          await this.env.QNFO_PROJECTS.put(
            `_agent-results/${taskId}/result.json`,
            JSON.stringify(state, null, 2),
            { httpMetadata: { contentType: "application/json" } }
          );
          return;
        }
        // qwen2.5-coder Workers AI rejects assistant-with-tool_calls messages;
        // push only the tool results; the model answers from [system, user, tool...]
        for (const tc of toolCalls) {
          let result;
          try {
            const args = JSON.parse(tc.function.arguments);
            result = await this.executeTool(tc.function.name, args);
          } catch (e) {
            result = JSON.stringify({ error: `Tool execution failed: ${e.message}` });
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result
          });
        }
      }
      messages.push({
        role: "user",
        content: "You have reached the maximum number of steps. Provide your final answer now based on the information gathered. Do NOT make additional tool calls."
      });
      const finalResponse = await this.env.AI.run(
        "@cf/qwen/qwen2.5-coder-32b-instruct",
        { messages, max_tokens: 4096, temperature: 0.3 }
      );
      state.status = "completed";
      state.result = finalResponse.response || finalResponse.content || "No result produced";
      state.completedAt = Date.now();
      state.messages = messages;
      await this.ctx.storage.put("state", state);
      await this.env.QNFO_PROJECTS.put(
        `_agent-results/${taskId}/result.json`,
        JSON.stringify(state, null, 2),
        { httpMetadata: { contentType: "application/json" } }
      );
    } catch (err) {
      state.status = "failed";
      state.error = err.message;
      state.completedAt = Date.now();
      await this.ctx.storage.put("state", state);
    }
  }
  // ── Tool execution ───────────────────────────────────────
  async executeTool(name, args) {
    switch (name) {
      case "search_papers": {
        const limit = Math.min(args.limit || 5, 10);
        const embedResp = await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
          text: [args.query]
        });
        const vector = embedResp.data?.[0] || embedResp[0];
        if (!vector) return JSON.stringify({ error: "Embedding failed" });
        const results = await this.env.PAPER_VZ.query(vector, {
          topK: limit,
          returnValues: false,
          returnMetadata: true
        });
        const matches = results.matches.map((m) => ({
          id: m.id,
          score: Math.round(m.score * 1e3) / 1e3,
          slug: m.metadata?.slug || m.id,
          title: m.metadata?.title || "",
          authors: m.metadata?.authors || ""
        }));
        return JSON.stringify({ count: matches.length, matches });
      }
      case "get_paper_context": {
        const row = await this.env.LIVING_PAPER.prepare("SELECT body_md, doi, authors, title FROM papers WHERE slug = ?").bind(args.slug).first();
        if (!row) return JSON.stringify({ error: `Paper not found: ${args.slug}` });
        return JSON.stringify({
          slug: args.slug,
          doi: row.doi,
          title: row.title,
          authors: row.authors,
          body: (row.body_md || "").substring(0, 8e3)
        });
      }
      case "query_graph": {
        const sql = (args.sql || "").trim();
        if (!sql.toUpperCase().startsWith("SELECT")) {
          return JSON.stringify({ error: "Only SELECT queries allowed" });
        }
        const result = await this.env.QNFO_GRAPH.prepare(sql).all();
        return JSON.stringify({
          results: result.results,
          count: result.results?.length || 0
        });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }
};
var agent_orchestrator_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;
    if (method === "POST" || method === "PATCH") {
      const auth = request.headers.get("X-Sync-Token");
      if (!auth || !env.SYNC_TOKEN || auth !== env.SYNC_TOKEN) {
        return Response.json({ error: "Unauthorized: missing or invalid X-Sync-Token" }, { status: 401 });
      }
    }
    if (url.pathname === "/health") {
      return Response.json({
        worker: "qnfo-agent-orchestrator",
        version: "v1.0.0",
        status: "ok",
        bindings: {
          d1_living_paper: !!env.LIVING_PAPER,
          d1_graph: !!env.QNFO_GRAPH,
          vectorize: !!env.PAPER_VZ,
          r2: !!env.QNFO_PROJECTS,
          ai: !!env.AI,
          do_agent_task: !!env.AGENT_TASK
        },
        uptime: Date.now()
      });
    }
    if (url.pathname === "/task" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }
      if (!body.prompt || typeof body.prompt !== "string") {
        return Response.json({ error: "Missing required field: prompt (string)" }, { status: 400 });
      }
      const taskId = crypto.randomUUID();
      const maxSteps = Math.min(body.max_steps || 5, 10);
      const doId = env.AGENT_TASK.idFromName(taskId);
      const stub = env.AGENT_TASK.get(doId);
      ctx.waitUntil(
        stub.fetch(new Request(`https://do/task/${taskId}/start`, {
          method: "POST",
          body: JSON.stringify({ prompt: body.prompt, maxSteps })
        }))
      );
      return Response.json({
        task_id: taskId,
        status: "queued",
        poll_url: `/task/${taskId}`
      }, { status: 202 });
    }
    const taskMatch = url.pathname.match(/^\/task\/([a-f0-9-]+)$/);
    if (taskMatch && request.method === "GET") {
      const taskId = taskMatch[1];
      const doId = env.AGENT_TASK.idFromName(taskId);
      const stub = env.AGENT_TASK.get(doId);
      const resp = await stub.fetch(new Request(`https://do/task/${taskId}/status`));
      return resp;
    }
    if (url.pathname === "/") {
      return Response.json({
        worker: "qnfo-agent-orchestrator",
        endpoints: {
          "POST /task": "Create agent task { prompt, max_steps? }",
          "GET /task/:id": "Poll task status and result",
          "GET /health": "Worker health and binding check"
        }
      });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }
};
export {
  AgentTask,
  agent_orchestrator_default as default
};
//# sourceMappingURL=agent-orchestrator.js.map
