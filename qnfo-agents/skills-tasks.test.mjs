// SKILL-SEARCH-1 (issue 9675) and TASKLIST-1 (issue 9673), offline: the pure helpers directly, the Durable Object and routes by source shape.
import { FLEET_SKILLS, skillSearch, skillGet, skillTokens, tasksFromPlan, taskUpdate, taskSummary } from "./src/skills.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const src = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");

ok(FLEET_SKILLS.length >= 12 && new Set(FLEET_SKILLS.map((s) => s.name)).size === FLEET_SKILLS.length, "the repository holds at least 12 distinctly named skills");
ok(FLEET_SKILLS.every((s) => s.what && s.kw && s.steps.length >= 1), "every skill has a description, keywords and steps");
ok(skillSearch("how do I revert a merged agent pr", FLEET_SKILLS)[0].name === "undo-agent-pr", "a revert question finds the undo skill first");
ok(skillSearch("bump the version of a worker", FLEET_SKILLS)[0].name === "worker-release-bump", "a version bump question finds the release skill first");
ok(skillSearch("durable object alarm", FLEET_SKILLS)[0].name === "durable-objects", "keywords find the durable-objects skill");
ok(skillSearch("zzzz qqqq", FLEET_SKILLS).length === 0 && skillSearch("", FLEET_SKILLS).length === 0 && skillSearch("the a of", FLEET_SKILLS).length === 0, "no match, empty and stop-word queries return nothing");
ok(skillSearch("deploy", FLEET_SKILLS, 2).length === 2 && skillSearch("deploy", FLEET_SKILLS, 99).length <= 10, "the limit is respected and capped at 10");
ok(skillGet("WRANGLER ", FLEET_SKILLS).name === "wrangler" && skillGet("nope", FLEET_SKILLS) === null, "a skill is read by exact name, case-insensitive");
ok(skillTokens("Revert-a PR!").join(",") === "revert,pr", "tokens drop punctuation and stop words");

const t = tasksFromPlan(["  read the file ", "", "edit it", "verify live"]);
ok(t.length === 3 && t[0].id === 1 && t[2].id === 3 && t.every((x) => x.status === "todo"), "a plan's steps become numbered todo tasks, blanks dropped");
ok(tasksFromPlan(new Array(20).fill("step one")).length === 12, "at most 12 tasks");
ok(taskUpdate({ id: 2, status: "done" }).status === "done" && taskUpdate({ id: 0, status: "done" }).error && taskUpdate({ id: 1, status: "x" }).error, "a task update needs a task number and a known status");
ok(JSON.stringify(taskSummary([{ status: "done" }, { status: "doing" }, { status: "todo" }])) === '{"total":3,"done":1,"doing":1}', "the summary counts done and doing");

ok(/CREATE TABLE IF NOT EXISTS code_session_tasks/.test(src), "the session keeps its task list in its own SQLite table");
ok(/INSERT INTO code_session_tasks/.test(src) && /tasksFromPlan\(p\.plan\.steps\)/.test(src), "an approved plan creates the task list");
ok(/t\.update_task = tool\(/.test(src) && /updateTask: \(input\) => this\.updateTaskStatus\(turn, input\)/.test(src), "the agent moves tasks with update_task through the gate");
ok(/plan\|tasks/.test(src) && /sessionMatch\[2\] === "tasks"/.test(src), "GET /code-sessions/<id>/tasks serves the list");
ok(/t\.skill_search = tool\(/.test(src) && /t\.skill_get = tool\(/.test(src), "the agent has skill_search and skill_get");
ok(/path === "\/skill-repo"/.test(src) && /agent_skill_events/.test(src), "GET /skill-repo searches the repository and logs the lookup");

console.log((fail ? "FAIL" : "PASS") + " skills-tasks " + pass + " ok, " + fail + " failed");
process.exit(fail ? 1 : 0);
