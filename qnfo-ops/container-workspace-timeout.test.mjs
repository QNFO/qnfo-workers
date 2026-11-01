import { readFileSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (value !== undefined ? " :: " + JSON.stringify(value) : ""));
  }
};

const start = src.indexOf("async function containerWorkspaceExec(env, args) {");
const end = src.indexOf("\n__name(containerWorkspaceExec", start);
const implementation = start >= 0 && end > start ? src.slice(start, end) : "";
ok(implementation.length > 100, "containerWorkspaceExec is found");

const calls = [];
const dispatch = async (env, route, body, timeout) => {
  calls.push({ route, body, timeout });
  return { ok: true, result: { exitCode: 0, stdout: "done", stderr: "" } };
};
const run = new Function(
  "workspaceStage",
  "containerDispatch",
  "fmtContainer",
  implementation + "\nreturn containerWorkspaceExec;"
)(
  async () => ({ prelude: "", staged: [], skipped: [] }),
  dispatch,
  (result) => ({ ok: result.result.exitCode === 0, stdout: result.result.stdout })
);

await run({}, { cmd: "node --version" });
ok(calls[0]?.timeout === 120000, "an omitted timeout allows 120 seconds for cold-start setup", calls[0]);
ok(calls[0]?.route === "/workspace/exec", "the workspace execution route is unchanged");

await run({}, { cmd: "true", timeout_ms: 45000 });
ok(calls[1]?.timeout === 45000, "an explicit timeout remains in effect", calls[1]);

await run({}, { cmd: "true", timeout_ms: 1 });
ok(calls[2]?.timeout === 5000, "the existing minimum timeout is preserved", calls[2]);

await run({}, { cmd: "true", timeout_ms: 999999 });
ok(calls[3]?.timeout === 300000, "the existing five-minute maximum is preserved", calls[3]);

const declaration = src.split("\n").find((line) => line.includes('{ name: "container_workspace_exec", description')) || "";
ok(
  /timeout_ms: \{ type: "number", description: "request timeout in ms \(default 120000; max 300000; allows cold-start initialization\)" \}/.test(declaration),
  "the tool schema documents its default and maximum timeout"
);
ok(src === mirror, "the deployed worker mirror matches the source");
ok(versionAtLeast((/^var VERSION = "([^"]+)"/m.exec(src) || [])[1] || "", "2.62.1"), "the patch version is bumped");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
