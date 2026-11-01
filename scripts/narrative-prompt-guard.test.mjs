// NARRATIVE-PROMPT-GUARD-1 offline suite: scripts/narrative-prompt-guard.py searches the whole text of every <dir>/worker.js and <dir>/deployed-current.worker.js, comments and tag
// names included, for the phrases it bans, and it only runs in deploy-gate, which is advisory on a pull request (MERGE-STREAMLINE-1): #5526 put "program placement" in a comment
// of qnfo-github-steward and main stayed red on that step until it was reworded. The failure named the file but not the line of a 148 KB worker.
// Proves, on a synthetic tree (the script's --root option): a clean tree passes; a banned phrase in a comment fails with the file and its line; the line is right for a hit on
// line 1, in the middle, and in the mirror; every hit of one run is listed; an exempt directory is not scanned; the default root is still the repository.
// Run: node scripts/narrative-prompt-guard.test.mjs   -> prints "N passed, 0 failed"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, "narrative-prompt-guard.py");
const PY = ["python3", "python"].find((c) => { const r = spawnSync(c, ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); return r.status === 0 && String(r.stdout).trim() === "3"; });
ok(!!PY, "a python 3 interpreter is available");

const run = (...args) => { const r = spawnSync(PY, [guard, ...args], { encoding: "utf8", timeout: 60000 }); return { code: r.status, out: String(r.stdout || "") + String(r.stderr || "") }; };
const tree = (files) => {
  const root = mkdtempSync(join(tmpdir(), "npg-"));
  for (const [path, text] of Object.entries(files)) { mkdirSync(join(root, dirname(path)), { recursive: true }); writeFileSync(join(root, path), text); }
  return root;
};

if (PY) {
  const clean = tree({ "qnfo-demo/worker.js": "// nothing here\nexport default {};\n", "qnfo-demo/deployed-current.worker.js": "export default {};\n" });
  let r = run("--root", clean);
  ok(r.code === 0 && /NARRATIVE-PROMPT-GUARD-1 PASS: 2 narrative source\(s\) clean/.test(r.out), "a clean tree passes", r);

  const dirty = tree({
    "qnfo-demo/worker.js": "// one\n// two\n/* Such a row is a program placement and is left alone */\nexport default {};\n",
    "qnfo-demo/deployed-current.worker.js": "var a = 1;\n// a fit table\n",
    "qnfo-first/worker.js": "the primary home of this is line one\n",
    "qnfo-ops/worker.js": "// program placement is fine in an ops worker (exempt directory)\n",
  });
  r = run("--root", dirty);
  ok(r.code === 1 && /^NARRATIVE-PROMPT-GUARD-1 FAIL/.test(r.out), "a banned phrase in a comment fails the guard", r);
  ok(/qnfo-demo\/worker\.js:3: banned: program placement/.test(r.out), "the failure names the file and the line of the hit (middle of the file)", r.out);
  ok(/qnfo-demo\/deployed-current\.worker\.js:2: banned: fit table/.test(r.out), "a hit in the deploy mirror is named with its own line", r.out);
  ok(/qnfo-first\/worker\.js:1: banned: primary home/.test(r.out), "a hit on the first line is line 1", r.out);
  ok(!/qnfo-ops/.test(r.out), "an exempt directory is not scanned", r.out);
  ok(/comments and tag names included/.test(r.out), "the failure says that comments are searched too", r.out);

  const real = run();
  ok(/NARRATIVE-PROMPT-GUARD-1 (PASS: \d{2,} narrative source|FAIL)/.test(real.out), "the default root is this repository: it finds its worker sources", real.out.slice(0, 300));

  for (const d of [clean, dirty]) rmSync(d, { recursive: true, force: true });
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
