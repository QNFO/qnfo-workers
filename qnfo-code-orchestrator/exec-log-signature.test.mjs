// EXEC-LOG-SIGNATURE-1 (qnfo-code-orchestrator 0.14.4, agent_issues 2488, pillar autonomy). Every proposal syntax check logged the same
// first 80 characters of its check script, so LOOP-BREAKER-1 (v_loop_breaker_signatures: status 'error', first 48 characters without
// digits) read three unrelated rejected proposals as one recurring orchestrator failure, and the syntax error itself was never logged.
// Proves: a labelled exec is logged by its label and what it printed; a syntax error the py-compile check finds (exit 3) is status
// 'rejected', never 'error'; a container failure of the same check stays 'error'; an unlabelled call keeps its old text and gains
// its exit code and output; pyCompile sends the label.
// Run: node qnfo-code-orchestrator/exec-log-signature.test.mjs   (exit 0 = all passed)
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("function execLogEntry("), b = src.indexOf("async function audit(");
if (a < 0 || b < a) throw new Error("execLogEntry not found ahead of audit()");
const cx = vm.createContext({});
vm.runInContext(src.slice(a, b) + "\nthis.f = execLogEntry;", cx);
const f = cx.f;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };
const code = "import base64,sys\ntry:\n compile(base64.b64decode('IyEvdXNyL2Jpbi9lbnYgcHl0aG9uMw==').decode('utf-8'),'proposal.py','exec')";
const sig = (t) => t.replace(/[0-9]/g, "").trim().slice(0, 48); // v_loop_breaker_signatures
const r1 = f(code, "py-compile", { exitCode: 3, stdout: "SYNTAX_ERROR 41 invalid syntax\n", stderr: "" });
ok(r1.status === "rejected", "a syntax error in a proposal is a rejected draft, not an orchestrator error", r1);
ok(r1.text === "exec py-compile: SYNTAX_ERROR 41 invalid syntax (exit 3)", "the log names the error the check found", r1.text);
const r2 = f(code, "py-compile", { exitCode: 1, stdout: "", stderr: "Traceback ... MemoryError" });
ok(r2.status === "error" && /MemoryError/.test(r2.text), "a container failure of the check stays an error and says why", r2);
const r3 = f(code, "py-compile", { exitCode: 0, stdout: "COMPILE_OK", stderr: "" });
ok(r3.status === "ok" && r3.text === "exec py-compile: ok", "a passing check is ok", r3);
const r4 = f("print(1/0)", "", { exitCode: 1, stdout: "", stderr: "ZeroDivisionError: division by zero" });
ok(r4.status === "error" && r4.text.indexOf("exec: print(1/0) -> exit 1: ZeroDivisionError") === 0, "an unlabelled call keeps its code prefix and gains its exit code and output", r4.text);
ok(f(code, undefined, { exitCode: 0 }).text === "exec: " + code.slice(0, 80), "an unlabelled success logs exactly the old text");
ok(sig(r1.text) !== sig("exec: " + code.slice(0, 80)), "the rejected check no longer carries the old shared signature");
ok(f(code, "x".repeat(90), { exitCode: 0 }).label.length === 40, "a label is capped at 40 characters");
const py = src.slice(src.indexOf("async function pyCompile("), src.indexOf("async function pyCompile(") + 900);
ok(/JSON\.stringify\(\{ code: code, label: "py-compile" \}\)/.test(py), "pyCompile sends the py-compile label");
const h = src.slice(src.indexOf('if (p === "/exec") {'), src.indexOf('if (p === "/task") {'));
ok(/const entry = execLogEntry\(code, body\.label, out\);/.test(h) && /entry\.status\);/.test(h), "the /exec route logs through execLogEntry");
const vm2 = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(vm2 && (+vm2[1] > 0 || +vm2[2] > 14 || (+vm2[2] === 14 && +vm2[3] >= 4)), "VERSION is at least 0.14.4", vm2 && vm2[0]);
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
