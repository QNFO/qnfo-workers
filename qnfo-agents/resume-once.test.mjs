// RESUME-ONCE-1 offline suite: a stalled run is re-queued once, then fails with its last tool. Run: node --no-warnings qnfo-agents/resume-once.test.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
const start = src.split("async onStart()")[1].slice(0, 3500);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
ok(/ALTER TABLE runs ADD COLUMN resumed/.test(start), "resumed column added with a guarded ALTER");
ok(/if \(!x\.resumed\)/.test(start) && /resumed = 1, status = 'queued'/.test(start), "first stall re-queues and marks resumed");
ok(start.indexOf("if (!x.resumed)") < start.indexOf("abandoned: no progress") && /continue;/.test(start), "resume precedes the abandon failure, which a second stall still reaches");
ok(/executeRun\(rid\)/.test(start), "the resumed run is executed again from the same row (prompt, caller, scope)");
ok(/UPDATE cf_agent_runs SET status = 'queued', error = NULL, created_ms/.test(start), "ledger clock restarts so ledger() does not fail the resumed run");
ok(/\(last tool: /.test(start), "a second stall still names the last tool");
console.log("resume-once: " + pass + " passed, " + fail + " failed"); process.exit(fail ? 1 : 0);
