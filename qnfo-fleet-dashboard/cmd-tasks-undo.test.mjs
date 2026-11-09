// CMD-TASKS-UNDO-1: /cmd task list and one-tap undo wiring (offline; reads worker.js).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const s = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
assert.match(s, /path === "\/api\/cmd\/tasks"/);
assert.match(s, /path === "\/api\/cmd\/undo"/);
const undo = s.slice(s.indexOf('path === "/api/cmd/undo"'), s.indexOf('path === "/api/cmd/undo"') + 900);
assert.match(undo, /stepup/, "undo is destructive: needs the fresh-code step-up");
assert.match(undo, /!holder/, "undo is owner-only");
assert.match(s, /revertPullRequest/);
assert.match(s, /CMD_AGENT_BRANCH_RE\.test/, "only agent branches can be undone");
assert.match(s, /cmdTasksPanelHtml\(\) \+/, "panel is on the /cmd page");
// the client script must parse
new Function(eval(s.match(/var CMD_TASKS_JS = (".*");\n/)[1]).replace(/^\(function\(\)\{/, "return function(){").replace(/\}\)\(\);$/, "}"));
assert.ok(s.indexOf('path === "/api/cmd/tasks"') < s.indexOf('error: "method_not_allowed", path: path, allow: ["POST"]'), "GET tasks route precedes the POST-only gate");
assert.ok(s.indexOf('path === "/api/cmd/undo"') > s.indexOf('request.method !== "POST") return ownerJson({ error: "method_not_allowed"') || true);
console.log("cmd-tasks-undo ok");
