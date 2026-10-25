import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (condition, message) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message);
  }
};

const helperStart = src.indexOf("function opsWorkflowToolCallId(");
const helperEnd = src.indexOf("\n}", helperStart) + 2;
ok(helperStart >= 0 && helperEnd > helperStart, "deterministic workflow tool-call id helper exists");
const helper = new Function(src.slice(helperStart, helperEnd) + "\nreturn opsWorkflowToolCallId;")();
ok(helper(4, 0, "provider-call-id") === "provider-call-id", "provider tool-call IDs remain unchanged");
ok(helper(4, 0, "") === helper(4, 0, undefined), "missing tool-call IDs stay stable across workflow replay");
ok(helper(4, 0, undefined) !== helper(4, 1, undefined), "tool calls in one turn receive distinct fallback IDs");

const stepNameStart = src.indexOf("function opsWorkflowToolStepName(");
const stepNameEnd = src.indexOf("\n}", stepNameStart) + 2;
const stepName = new Function(src.slice(stepNameStart, stepNameEnd) + "\nreturn opsWorkflowToolStepName;")();
ok(stepName(4, 0, "same-id") !== stepName(4, 1, "same-id"), "checkpoint names stay unique when provider IDs collide");

const workflowStart = src.indexOf("var OpsExecWorkflow = class");
const workflowEnd = src.indexOf("\n};", workflowStart) + 3;
const workflow = src.slice(workflowStart, workflowEnd);
ok(/const stableToolIds = Number\(body\._workflow_checkpoint_version\) >= 1/.test(workflow), "new jobs opt into deterministic tool checkpoint IDs");
ok(/stableToolIds \? opsWorkflowToolCallId\(turn, toolIndex, tc\.id\) : String\(tc\.id \|\| randId\("tc-"\)\)/.test(workflow), "existing jobs retain their original checkpoint names");
ok(/stableToolIds \? opsWorkflowToolStepName\(turn, toolIndex, tid\) : "tool-" \+ turn \+ "-" \+ tid/.test(workflow), "new checkpoint names include the tool index");
const createJobStart = src.indexOf("async function createJobFromBody(");
const createJobEnd = src.indexOf("\n}", createJobStart) + 2;
const createJob = src.slice(createJobStart, createJobEnd);
ok(/out\._workflow_checkpoint_version = 1/.test(src), "redacted job copies carry the checkpoint naming version");
ok(/const stored = JSON\.stringify\(redactJobBody\(body\)\)/.test(createJob), "the checkpoint version is stored with the redacted job payload");

const checkpoints = new Map();
let visibleEffects = 0;
async function executeCheckpoint(name, action) {
  if (checkpoints.has(name)) return checkpoints.get(name);
  const result = await action();
  checkpoints.set(name, result);
  return result;
}
async function resumeToolCall() {
  const turn = 4;
  const callId = helper(turn, 0, undefined);
  return executeCheckpoint(stepName(turn, 0, callId), async () => {
    visibleEffects++;
    return { ok: true };
  });
}

await resumeToolCall();
await resumeToolCall();
ok(visibleEffects === 1, "a completed tool checkpoint is reused after workflow restart");

// Run the real Workflow and research_queue handler, not just the checkpoint naming helpers.
// The synthetic intent service commits before the tool checkpoint is lost; no network is allowed.
const workerImport = 'import { WorkflowEntrypoint, DurableObject, tracing } from "cloudflare:workers";';
assert.ok(src.includes(workerImport), "worker platform import is available for the offline loader");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(workerImport,
  "var WorkflowEntrypoint = class {}; var DurableObject = class {}; var tracing = { enterSpan(_name, callback) { return callback({ setAttribute() {} }); } };"
)).toString("base64"));

async function interruptedIntake(dedupeAvailable) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE intents (id TEXT PRIMARY KEY, desire TEXT, status TEXT, created_at TEXT);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
    CREATE TABLE ops_ai_log (id TEXT PRIMARY KEY, ts TEXT NOT NULL, model TEXT, strategy TEXT, complexity TEXT,
      domain TEXT, prompt TEXT, response TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, cost_usd REAL,
      latency_ms INTEGER, tool_calls TEXT, source TEXT, ua TEXT, streamed INTEGER DEFAULT 0, ok INTEGER DEFAULT 1,
      upstream_model TEXT, job_id TEXT);
    CREATE TABLE ops_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'queued', model TEXT, strategy TEXT,
      payload TEXT, response TEXT, tool_log TEXT, error TEXT, created_at TEXT, updated_at TEXT, origin TEXT);
  `);
  db.prepare("INSERT INTO ops_jobs (id, payload) VALUES (?, ?)").run("job-replay", JSON.stringify({
    _workflow_checkpoint_version: 1, model: "ops-exec",
    messages: [{ role: "user", content: "Queue the synthetic recovery acceptance idea" }]
  }));
  const audit = {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values.map((value) => value === undefined ? null : value); return stmt; },
        async first() {
          // Negative control: remove the handler's existing readback contract.
          if (!dedupeAvailable && sql.startsWith("SELECT id, status, created_at FROM intents")) return null;
          return db.prepare(sql).get(...args) || null;
        },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() {
          const result = db.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(result.changes) } };
        }
      };
      return stmt;
    },
    async batch(statements) {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    }
  };
  let sinkCalls = 0, modelCalls = 0, toolAttempts = 0;
  const env = {
    QNFO_AUDIT: audit, INTENT_TOKEN: "synthetic-offline-only",
    QNFO_INTENT: {
      async fetch(url, init) {
        assert.equal(url, "https://qnfo-intent-orchestrator.internal/intent");
        assert.equal(init.method, "POST");
        const { desire } = JSON.parse(init.body);
        const id = "synthetic-intent-" + ++sinkCalls;
        db.prepare("INSERT INTO intents VALUES (?, ?, 'queued', datetime('now'))").run(id, desire);
        return Response.json({ ok: true, id });
      }
    }
  };
  const persistedSteps = new Map();
  let crashPending = true;
  const interrupted = new Error("synthetic interruption after effect, before checkpoint persistence");
  function restart() {
    const wf = new mod.OpsExecWorkflow();
    wf.env = env;
    return wf.run({ payload: { jobId: "job-replay" } }, {
      async do(name, options, callback) {
        if (persistedSteps.has(name)) return structuredClone(persistedSteps.get(name));
        if (name.startsWith("tool-")) toolAttempts++;
        const result = await (typeof options === "function" ? options : callback)();
        if (name.startsWith("tool-") && crashPending) {
          crashPending = false;
          assert.equal(db.prepare("SELECT COUNT(*) AS n FROM intents").get().n, 1);
          throw interrupted;
        }
        persistedSteps.set(name, structuredClone(result));
        return result;
      }
    });
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    modelCalls++;
    const message = body.messages.some((message) => message.role === "tool")
      ? { role: "assistant", content: "Synthetic intake recovered" }
      : { role: "assistant", content: "", tool_calls: [{ type: "function",
        function: { name: "research_queue", arguments: JSON.stringify({ idea: "synthetic-recovery-acceptance" }) } }] };
    return Response.json({ choices: [{ message, finish_reason: message.tool_calls ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 10 } });
  };
  try {
    await assert.rejects(restart(), (error) => error === interrupted);
    assert.ok(persistedSteps.has("turn-0"), "the model response was checkpointed before interruption");
    assert.ok(![...persistedSteps.keys()].some((name) => name.startsWith("tool-")), "the committed effect has no completed tool checkpoint");
    const recovered = await restart();
    assert.equal(recovered.status, "succeeded");
    assert.equal(db.prepare("SELECT status FROM ops_jobs WHERE id = 'job-replay'").get().status, "succeeded");
    const effects = db.prepare("SELECT COUNT(*) AS n FROM intents").get().n;
    const toolResult = [...persistedSteps.entries()].find(([name]) => name.startsWith("tool-"))[1];
    await restart();
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM intents").get().n, effects, "a completed replay adds no intent");
    return { effects, sinkCalls, modelCalls, toolAttempts, toolResult: JSON.parse(toolResult.text) };
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
}

const recovered = await interruptedIntake(true);
ok(recovered.toolAttempts === 2 && recovered.modelCalls === 2, "the real tool callback retried after interruption while the completed model turn was reused");
ok(recovered.effects === 1 && recovered.sinkCalls === 1, "research intake readback preserves one visible outcome after commit-before-checkpoint interruption");
ok(recovered.toolResult.ok && recovered.toolResult.expressed.deduped, "the real research_queue handler reports the persisted intent as deduped on recovery");
const unsupported = await interruptedIntake(false);
ok(unsupported.effects === 2 && unsupported.sinkCalls === 2, "negative control exposes duplicate effects without the readback contract; step names alone are not exactly-once");

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
