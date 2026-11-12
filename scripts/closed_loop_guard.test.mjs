// CLOSED-LOOP-1: the guard fails a PR that adds a wait on a person and passes rule text, negations and identity-bound cards.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "clg-"));
const run = (files) => { const p = join(dir, "f.json"); writeFileSync(p, JSON.stringify(files));
  try { execFileSync("python3", [new URL("./closed_loop_guard.py", import.meta.url).pathname, "--files", p], { stdio: "pipe" }); return 0; } catch (e) { return e.status; } };
const cases = [
  ["wait in worker", [{ filename: "x/worker.js", patch: "+// park until the owner must review the draft" }], 1],
  ["awaiting approval", [{ filename: "x/worker.js", patch: "+status = 'awaiting approval';" }], 1],
  ["negation passes", [{ filename: "x/worker.js", patch: "+// never wait for the owner to review: the default applies" }], 0],
  ["card without IB", [{ filename: "migrations/a.sql", patch: "+INSERT INTO human_actions (slug, why) VALUES ('x', 'choose a colour');" }], 1],
  ["card with IB", [{ filename: "migrations/a.sql", patch: "+INSERT INTO human_actions (slug, why) VALUES ('x', 'IDENTITY-BOUND: pay the invoice');" }], 0],
  ["rule text exempt", [{ filename: "CLAUDE.md", patch: "+a person must review" }], 0],
  ["removed line ignored", [{ filename: "x/worker.js", patch: "-// for the owner to decide" }], 0],
];
let fail = 0;
for (const [name, files, want] of cases) { const got = run(files); if (got !== want) { console.log(`FAIL ${name}: exit ${got}, want ${want}`); fail++; } }
console.log(`closed-loop-guard: ${cases.length - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
