// CF-AGENTS-1 (qnfo-agents), offline. Locks the access rules and the bundle invariants the fleet's guards rely on.
// ADVERSARIAL: the helpers are tested directly; the bundle is checked by shape (it needs the Workers runtime to run). The live proof
// is GET https://agents.qnfo.org/health answering this VERSION, a public POST /run answering 403, and a console turn reaching done.
import { readFileSync } from "node:fs";
import { callerOf, scopeOf, opsToolAllowed, readOnlySql, repoPathOk, codeTaskText, scheduleWhen, safeToolName, sliceLines, OPS_READ_ONLY, validateRequest, loopInstance, requesterOk, DRAIN_PER_TICK, EMPTY_TEXT, lastStepText, toolTranscript } from "./src/lib.js";
const here = (p) => new URL(p, import.meta.url);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// Callers: only service-binding props from the two owner-verifying workers count.
ok(callerOf({ props: { caller: "qnfo-fleet-dashboard" } }) === "qnfo-fleet-dashboard", "dashboard is trusted");
ok(callerOf({ props: { caller: "qnfo-ops" } }) === "qnfo-ops", "qnfo-ops is trusted");
ok(callerOf({ props: { caller: "qnfo-social" } }) === "", "another worker is not trusted");
ok(callerOf({}) === "" && callerOf(null) === "", "no props, no caller");
ok(scopeOf("", "write") === "public", "a public request never gets write");
ok(scopeOf("qnfo-ops", "write") === "write" && scopeOf("qnfo-ops", "") === "read", "write only when the trusted caller asks");

// Ops tools: read-only names in read, everything in write, nothing in public.
ok(opsToolAllowed("fleet_status", "read") && !opsToolAllowed("github_file_write", "read"), "read scope keeps to read-only ops tools");
ok(opsToolAllowed("github_file_write", "write"), "write scope reaches mutating ops tools");
ok(!opsToolAllowed("fleet_status", "public"), "public scope reaches no ops tool");
const dash = readFileSync(here("../qnfo-fleet-dashboard/worker.js"), "utf8");
const m = /var CMD_TOOL_READ_ONLY = \{([^}]*)\}/.exec(dash);
const dashList = m ? m[1].split(",").map((s) => s.split(":")[0].trim()).filter(Boolean).sort() : [];
ok(dashList.length > 10 && JSON.stringify(dashList) === JSON.stringify(OPS_READ_ONLY.slice().sort()), "OPS_READ_ONLY equals the console's CMD_TOOL_READ_ONLY");

// SQL: read-only, one statement, no private tables, capped.
ok(readOnlySql("SELECT id FROM agent_issues").sql === "SELECT id FROM agent_issues LIMIT 200", "a select gets a row cap");
ok(!!readOnlySql("SELECT 1; DELETE FROM agent_issues").error, "two statements are refused");
ok(!!readOnlySql("UPDATE agent_issues SET status='closed'").error, "update is refused");
ok(!!readOnlySql("WITH x AS (SELECT 1) DELETE FROM agent_issues").error, "a write inside WITH is refused");
ok(!!readOnlySql("SELECT token FROM console_agent_auth").error, "the stored agent session is not readable");
ok(!!readOnlySql("SELECT * FROM owner_sessions").error, "owner sessions are not readable");
ok(!readOnlySql("SELECT author FROM papers").error, "an ordinary column named author is readable");

// Repository paths, code-task text, schedules, names, slices.
ok(repoPathOk("qnfo-ops/worker.js") && !repoPathOk("../etc/passwd") && !repoPathOk("/abs") && !repoPathOk(""), "repository paths stay inside the repo");
const ct = codeTaskText({ path: "qnfo-ops/worker.js", goal: "Answer 404 for an unknown route", anchor: "no such route" });
ok(/\ncode-task: repo=qnfo-workers path=qnfo-ops\/worker\.js\ncode-anchor: no such route$/.test(ct.text || ""), "a proposal carries the code loop's intake lines");
ok(!!codeTaskText({ path: "x/../y", goal: "something long enough" }).error, "a bad path is refused");
ok(scheduleWhen({ cron: "0 * * * *" }).kind === "cron" && !!scheduleWhen({ cron: "* * * * *" }).error, "cron at most every 5 minutes");
ok(scheduleWhen({ delay_s: 600 }).when === 600 && !!scheduleWhen({ delay_s: 5 }).error, "delays from 60 s");
ok(safeToolName("ops_github-repo.read") === "ops_github_repo_read" && safeToolName("9x") === "t_9x", "tool names are JS identifiers");
const sl = sliceLines("a\nb\nc\nd", 2, 2, 5000);
ok(sl.text === "2\tb\n3\tc" && sl.total_lines === 4, "line slices are numbered");

// Bundle invariants: VERSION first, mirror identical, the Durable Object exported and migrated, no banned model id.
const w = readFileSync(here("./worker.js"), "utf8");
const pkg = JSON.parse(readFileSync(here("./package.json"), "utf8"));
const v = /^var VERSION = "(\d+\.\d+\.\d+)";/.exec(w);
ok(!!v && v[1] === pkg.version, "worker.js starts with var VERSION equal to package.json version");
ok(w === readFileSync(here("./deployed-current.worker.js"), "utf8"), "deployed-current.worker.js is identical to worker.js");
ok(/export\{[^}]*\bFleetCodeAgent\b[^}]*\}/.test(w), "the bundle exports FleetCodeAgent");
ok(w.indexOf("glm-4.7-flash") < 0, "no banned model id in the bundle (MODEL-FLOOR-1)");
const toml = readFileSync(here("./wrangler.toml"), "utf8");
ok(/\[exports\.FleetCodeAgent\]\ntype = "durable-object"\nstorage = "sqlite"/.test(toml) && !/\[\[migrations\]\]/.test(toml) && /class_name = "FleetCodeAgent"/.test(toml), "the agent class is bound and declared in exports, never with the legacy migrations array (DO-EXPORTS-1)");
ok(/^# charter-pillar: autonomy/m.test(toml), "charter pillar declared");
ok(/props = \{ caller = "qnfo-agents" \}/.test(toml), "qnfo-ops sees this worker as caller qnfo-agents");
ok(/\[triggers\]\ncrons = \["\*\/5 \* \* \* \*"\]/.test(toml), "CF-AGENTS-LOOPS-1: one 5-minute cron drains cf_agent_requests");
ok(readFileSync(here("./WRANGLER-ONLY"), "utf8").length > 20, "WRANGLER-ONLY keeps the canonical /content deploy away");
const src = readFileSync(here("./src/index.ts"), "utf8");
ok(/if \(!caller\) return json\(\{ ok: false, error: "This route is for the fleet console/.test(src), "every route past the open ones needs a trusted caller");
ok(src.indexOf('path === "/mcp"') < src.indexOf("if (!caller) return json"), "/mcp is open, with the public tool set");

// CF-AGENTS-LOOPS-1: the loop scope and the request queue.
ok(opsToolAllowed("ops_d1_query", "loop") && !opsToolAllowed("deploy_worker", "loop") && !opsToolAllowed("d1_write", "loop"), "loop scope: read-only ops tools only");
ok(validateRequest({ requester: "program-manager:research", kind: "run", prompt: "summarise the focus issues" }).kind === "run", "a run request validates");
ok(!!validateRequest({ requester: "pm", kind: "run", prompt: "short" }).error, "a run needs a real prompt");
ok(!!validateRequest({ requester: "pm", kind: "sandbox", code: "" }).error && validateRequest({ requester: "pm", kind: "sandbox", code: "async () => 1" }).kind === "sandbox", "a sandbox request needs code");
ok(!!validateRequest({ requester: "pm", kind: "schedule", prompt: "check the queue", cron: "* * * * *" }).error && validateRequest({ requester: "pm", kind: "schedule", prompt: "check the queue", cron: "0 * * * *" }).kind === "schedule", "a schedule keeps the 5-minute floor");
ok(!!validateRequest({ requester: "pm", kind: "deploy", prompt: "do something big" }).error, "unknown kinds are refused");
ok(!requesterOk("") && !requesterOk("x y") && requesterOk("portfolio-manager"), "the requester names the loop");
ok(loopInstance("program-manager:research") === "loop-program-manager-research" && loopInstance("pm", "managers") === "managers", "one agent instance per requester unless it names its own");
ok(DRAIN_PER_TICK >= 1 && DRAIN_PER_TICK <= 5, "the drain is bounded per tick");
ok(/async scheduled\(/.test(src) && /drainRequests\(env\)/.test(src), "the cron runs drainRequests");
ok(/path === "\/requests\/drain" && request\.method === "POST"/.test(src), "POST /requests/drain is the second drain path (spof_registry)");
ok(/scope: "loop"/.test(src) && /if \(c\.scope !== "write"\) return t;\n    t\.mcp_connect/.test(src), "loop turns get schedules but never MCP connections");
const mig = readFileSync(new URL("../migrations/2026-10-26-cf-agent-requests.sql", import.meta.url), "utf8");
ok(/CREATE TABLE IF NOT EXISTS cf_agent_requests/.test(mig) && /INSERT OR IGNORE INTO queue_sla/.test(mig) && /analytics_metric_triggers/.test(mig), "the queue ships with its SLA row and metric trigger");

// EMPTY-TURN-ANSWER-1: a turn that ends on a tool step still answers.
ok(lastStepText([{ text: "first finding" }, { text: "", toolCalls: [{}] }]) === "first finding", "the last step that wrote text is the answer");
ok(lastStepText([{ text: "" }, { text: "  " }]) === "" && lastStepText(undefined) === "", "no text anywhere reads empty");
const tt = toolTranscript([{ toolResults: [{ toolName: "fleet_sql", input: { sql: "SELECT 1" }, output: { ok: true, rows: 1 } }] }, { toolResults: [{ toolName: "repo_read_file", args: { path: "a" }, result: "x".repeat(5000) }] }], 3000);
ok(tt.length <= 3000 && /repo_read_file/.test(tt), "the transcript keeps the newest tool results within its budget", tt.slice(0, 120));
ok(/tool fleet_sql \{"sql":"SELECT 1"\} -> \{"ok":true,"rows":1\}/.test(toolTranscript([{ toolResults: [{ toolName: "fleet_sql", input: { sql: "SELECT 1" }, output: { ok: true, rows: 1 } }] }], 9000)), "a tool result reads as name, input and output");
const ts = readFileSync(here("./src/index.ts"), "utf8");
ok(/result = String\(out\.text \|\| ""\)\.trim\(\) \|\| lastStepText\(out\.steps\);/.test(ts) && /if \(!result\) \{[\s\S]{0,200}generateText\(\{ model: m\.model[^\n]*FINAL_ANSWER_ASK, abortSignal/.test(ts), "an empty turn gets one more call, without tools");
ok(/result = result \|\| EMPTY_TEXT;/.test(ts) && EMPTY_TEXT === "(the model returned no text)", "an answer that stays empty still says so");

console.log("qnfo-agents worker.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
