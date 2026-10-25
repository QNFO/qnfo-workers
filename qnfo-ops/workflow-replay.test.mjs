import { readFileSync } from "node:fs";

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

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
