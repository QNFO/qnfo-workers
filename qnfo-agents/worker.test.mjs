// CF-AGENTS-1 (qnfo-agents), offline. Locks the access rules and the bundle invariants the fleet's guards rely on.
// ADVERSARIAL: the helpers are tested directly; the bundle is checked by shape (it needs the Workers runtime to run). The live proof
// is GET https://agents.qnfo.org/health answering this VERSION, a public POST /run answering 403, and a console turn reaching done.
import { readFileSync } from "node:fs";
import { callerOf, scopeOf, opsToolAllowed, readOnlySql, repoPathOk, codeTaskText, scheduleWhen, safeToolName, sliceLines, OPS_READ_ONLY } from "./src/lib.js";
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
ok(/new_sqlite_classes = \["FleetCodeAgent"\]/.test(toml) && /class_name = "FleetCodeAgent"/.test(toml), "the agent class is bound and migrated");
ok(/^# charter-pillar: autonomy/m.test(toml), "charter pillar declared");
ok(/props = \{ caller = "qnfo-agents" \}/.test(toml), "qnfo-ops sees this worker as caller qnfo-agents");
ok(!/\[triggers\]|crons\s*=/.test(toml), "no wrangler cron (schedules are Durable Object alarms)");
ok(readFileSync(here("./WRANGLER-ONLY"), "utf8").length > 20, "WRANGLER-ONLY keeps the canonical /content deploy away");
const src = readFileSync(here("./src/index.ts"), "utf8");
ok(/if \(!caller\) return json\(\{ ok: false, error: "This route is for the fleet console/.test(src), "every route past the open ones needs a trusted caller");
ok(src.indexOf('path === "/mcp"') < src.indexOf("if (!caller) return json"), "/mcp is open, with the public tool set");

console.log("qnfo-agents worker.test: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
