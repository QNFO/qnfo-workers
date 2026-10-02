// test-hunk.mjs - HUNK-NO-EOL-1 (#1758): hunkPatch must produce small patches that `git apply` turns into exactly the
// proposed file, including files without a final newline (49 of 93 worker.js on 2026-10-02). Before this fix such a file fell
// back to the whole-file patch, and a ~93 KB worker plus its mirror exceeded code-task-publish's 200000-char limit.
// Run: node --no-warnings qnfo-code-orchestrator/test-hunk.mjs   (exit 0 = all assertions passed; needs git)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "worker.js"), "utf8");
function grab(name) {
  const i = src.indexOf("function " + name + "(");
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error("function " + name + " not found");
}
const dm = /DIFF_MAX_D = (\d+)/.exec(src);
const ctx = {};
vm.createContext(ctx);
vm.runInContext("const DIFF_MAX_D=" + (dm ? dm[1] : "600") + ";" + ["lineOps", "wholeFilePatch", "hunkPatch"].map(grab).join("\n") + ";this.hunkPatch=hunkPatch;", ctx);

const work = fs.mkdtempSync(path.join(os.tmpdir(), "hunk-"));
let fails = 0, runs = 0;
function check(label, base, next, maxLen) {
  runs++;
  const root = path.join(work, "r");
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "d"), { recursive: true });
  fs.writeFileSync(path.join(root, "d", "f.js"), base);
  const patch = ctx.hunkPatch("d/f.js", base, next);
  fs.writeFileSync(path.join(work, "p.diff"), patch);
  let why = "";
  try {
    execFileSync("git", ["apply", path.join(work, "p.diff")], { cwd: root, stdio: "pipe" });
    if (fs.readFileSync(path.join(root, "d", "f.js"), "utf8") !== next) why = "applied result differs from the proposal";
    else if (maxLen && patch.length > maxLen) why = "patch " + patch.length + " chars > " + maxLen;
  } catch (e) {
    why = "git apply: " + String(e.stderr || e.message).slice(0, 200);
  }
  if (why) { fails++; console.log("FAIL " + label + "  -- " + why); }
  else if (label.charAt(0) !== "~") console.log("PASS " + label + "  -- " + patch.length + " chars");
}

const L = (k) => Array.from({ length: k }, (_, i) => "line " + i);
// A worker-sized file (~95 KB, no final newline) with three edits far apart, like the q08 vote fix.
const big = Array.from({ length: 1300 }, (_, i) => "var v" + i + " = " + JSON.stringify("x".repeat(60)) + ";");
const bigNext = big.slice();
bigNext[300] = "var v300 = 'edited';"; bigNext[800] = "var v800 = 'edited';"; bigNext.splice(1200, 0, "// inserted");
check("worker-sized file without final newline, three distant edits", big.join("\n"), bigNext.join("\n"), 8000);
check("no final newline: change the last line", L(20).join("\n"), L(19).concat(["CHANGED"]).join("\n"));
check("no final newline: change a line inside the last context", L(20).join("\n"), L(20).map((x, i) => (i === 18 ? "X" : x)).join("\n"));
check("no final newline: append after the last line", L(20).join("\n"), L(22).join("\n"));
check("no final newline: delete the last line", L(20).join("\n"), L(19).join("\n"));
check("no final newline: change the first line only", L(20).join("\n"), ["X"].concat(L(20).slice(1)).join("\n"));
check("final newline: middle change", L(20).join("\n") + "\n", L(20).map((x, i) => (i === 9 ? "X" : x)).join("\n") + "\n");
check("add the final newline", L(5).join("\n"), L(5).join("\n") + "\n");
check("remove the final newline", L(5).join("\n") + "\n", L(5).join("\n"));

let seed = 7;
const rnd = (m) => (seed = (seed * 1103515245 + 12345) % 2147483648) % m;
let fuzz = 0;
for (let t = 0; t < 400; t++) {
  const eol = rnd(2) === 1, a = L(1 + rnd(30)), b = a.slice();
  for (let e = 0, E = 1 + rnd(4); e < E; e++) {
    const k = rnd(b.length + 1), op = rnd(3);
    if (op === 0 && b.length > 1) b.splice(Math.min(k, b.length - 1), 1);
    else if (op === 1) b.splice(k, 0, "new " + t + "." + e);
    else if (b.length) b[Math.min(k, b.length - 1)] = "mod " + t + "." + e;
  }
  const A = a.join("\n") + (eol ? "\n" : ""), B = b.join("\n") + (eol ? "\n" : "");
  if (A === B || !B.length) continue;
  fuzz++;
  check("~fuzz " + t, A, B);
}
console.log("fuzz cases: " + fuzz);
fs.rmSync(work, { recursive: true, force: true });
console.log("\n" + fails + " failure(s) of " + runs);
process.exit(fails ? 1 : 0);
