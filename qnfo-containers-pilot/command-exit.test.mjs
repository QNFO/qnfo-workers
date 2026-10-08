// COMMAND-EXIT-HONEST-1 offline suite (qnfo-containers-pilot 1.0.11). Drives ShellContainer from worker.js with a fake
// ctx.container and a fake D1, and reads the cloud_ops_events rows it writes. Proves: a caller's command that exits
// non-zero is recorded as status "warn" with its exit code and outcome "command-exit-nonzero" (it is the caller's
// result, the container worked); a clean exit stays "ok"; a container fault (exec throws) is still status "error" under
// container.error, so the pilot never hides its own failure.
// Run: node qnfo-containers-pilot/command-exit.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8")
  .replace(/^export \{ ShellContainer \};$/m, "")
  .replace(/^export default worker_default;$/m, "");
const mod = new Function(src + "\nreturn { ShellContainer, commandEventStatus, VERSION };")();

const rows = [];
const AUDIT = {
  prepare(sql) {
    return { bind(...a) { return { async run() { if (/cloud_ops_events/.test(sql)) rows.push({ kind: a[2], text: a[3], meta: a[4] && JSON.parse(a[4]), status: a[6] }); return { success: true }; } }; } };
  }
};
const env = { PILOT_TOKEN: "t", AUDIT };
let nextExit = 0, throwOnExec = null;
const ctx = {
  container: {
    running: true,
    async exec() {
      if (throwOnExec) throw new Error(throwOnExec);
      const code = nextExit;
      return { async output() { return { exitCode: code, stdout: new TextEncoder().encode("out"), stderr: new TextEncoder().encode(code ? "boom" : "") }; } };
    }
  },
  waitUntil() {}
};
const box = new mod.ShellContainer(ctx, env);
const call = (path, body) => box.fetch(new Request("https://containers-pilot.internal" + path, { method: "POST", headers: { Authorization: "Bearer t", "Content-Type": "application/json" }, body: JSON.stringify(body) }));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const last = () => rows[rows.length - 1];

ok(versionAtLeast(mod.VERSION, "1.0.11"), "VERSION is bumped (" + mod.VERSION + ")");
ok(mod.commandEventStatus(0) === "ok" && mod.commandEventStatus(1) === "warn" && mod.commandEventStatus(137) === "warn", "status mapping: 0 -> ok, non-zero -> warn");

nextExit = 0;
let r = await call("/sh", { cmd: "true" });
ok((await r.json()).ok === true && last().kind === "container.sh" && last().status === "ok" && last().meta.exitCode === 0 && !last().meta.outcome, "a clean /sh is ok with no outcome tag");

nextExit = 1;
r = await call("/sh", { cmd: "grep nothing file" });
let j = await r.json();
ok(j.ok === false && j.result.exitCode === 1, "the caller still gets ok:false and the exit code (response unchanged)");
ok(last().kind === "container.sh" && last().status === "warn" && last().meta.exitCode === 1 && last().meta.outcome === "command-exit-nonzero", "a failing /sh command is recorded as warn with exit code and outcome (" + JSON.stringify(last()) + ")");

nextExit = 2;
await call("/exec", { code: "raise SystemExit(2)" });
ok(last().kind === "container.exec" && last().status === "warn" && last().meta.exitCode === 2 && last().meta.outcome === "command-exit-nonzero", "a failing /exec script is recorded as warn");

nextExit = 3;
await call("/workspace/exec", { cmd: "false", dir: "repo" });
ok(last().kind === "container.workspace_exec" && last().status === "warn" && last().meta.dir === "repo" && last().meta.exitCode === 3, "a failing /workspace/exec keeps its dir and is recorded as warn");

nextExit = 0;
await call("/exec", { code: "print(1)" });
ok(last().kind === "container.exec" && last().status === "ok", "a clean /exec stays ok");

throwOnExec = "Network connection lost.";
r = await call("/sh", { cmd: "true" });
j = await r.json();
ok(r.status === 500 && j.ok === false && last().kind === "container.error" && last().status === "error" && last().text === "Network connection lost.", "a container fault (exec throws) is still container.error with status error");
throwOnExec = null;

const noContainer = new mod.ShellContainer({ waitUntil() {} }, env);
r = await noContainer.fetch(new Request("https://containers-pilot.internal/sh", { method: "POST", headers: { Authorization: "Bearer t" }, body: JSON.stringify({ cmd: "true" }) }));
ok(r.status === 500 && last().kind === "container.error" && last().status === "error" && /CONTAINER-CONFIG-MISSING-1/.test(last().text), "a missing container binding (#1485 signature) is still an error");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
