// SELF-CLOSED-LOOPS-1: the lint's own cases pass and the repo's instruction files carry the rule.
import { spawnSync } from "node:child_process";
let fail = 0;
for (const args of [["--selftest"], ["--base", "origin/main"]]) {
  const r = spawnSync("python3", ["scripts/self_closed_lint.py", ...args], { encoding: "utf8" });
  process.stdout.write(r.stdout + r.stderr);
  if (r.status !== 0) fail++;
}
process.exit(fail ? 1 : 0);
