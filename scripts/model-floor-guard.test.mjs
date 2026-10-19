// MODEL-FLOOR-PREMERGE-1 (agent_issues 100121) offline suite for scripts/model-floor-guard.mjs pull-request mode. Builds a base tree and a
// head tree of worker.js files in temp directories and runs the real CLI with --base. Proves: a banned model added to a worker string
// fails with exactly that violation; debt already on the base does not fail an unrelated change; a hit that only moves lines is not new;
// an added violation in a second worker is reported with the first untouched; a missing base directory exits 2; the plain mode still
// reports the whole tree; comment mentions stay documentation. Run: node scripts/model-floor-guard.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diffViolations } from "./model-floor-guard.mjs";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " :: " + JSON.stringify(d).slice(0, 400) : "")); } };
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-floor-guard.mjs");
const mk = (files) => { const root = mkdtempSync(path.join(tmpdir(), "mfg-")); for (const [w, body] of Object.entries(files)) { mkdirSync(path.join(root, w)); writeFileSync(path.join(root, w, "worker.js"), body); } return root; };
const run = (head, base, extra) => { const r = spawnSync(process.execPath, [script, ...(base ? ["--base", base] : []), ...(extra || [])], { env: { ...process.env, QNFO_WORKERS: head }, encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
const clean = 'var VERSION = "1.0.0";\nexport default { async fetch() { return new Response("ok"); } };\n';
const bad = 'var VERSION = "1.0.0";\nvar DESC = { example: "model such as llama-3.3-70b-instruct-fp8-fast" };\n';
const dirs = [];
const t = (files) => { const d = mk(files); dirs.push(d); return d; };

{ const base = t({ a: clean, b: clean }), head = t({ a: bad, b: clean });
  const r = run(head, base);
  ok(r.code === 1 && /\ba\b/.test(r.out) && /\[llama\]/.test(r.out) && /1 workers with new/.test(r.out), "a banned model added to a worker string fails the pull request", r); }
{ const base = t({ a: bad, b: clean }), head = t({ a: bad, b: clean + "// an unrelated change\n" });
  const r = run(head, base);
  ok(r.code === 0 && /0 workers with new/.test(r.out), "debt already on the base does not fail an unrelated change", r); }
{ const base = t({ a: bad }), head = t({ a: "// header comment\n// one more line\n" + bad });
  const r = run(head, base);
  ok(r.code === 0, "the same hit on a different line is not new", r); }
{ const base = t({ a: bad, b: clean }), head = t({ a: bad, b: bad });
  const r = run(head, base);
  ok(r.code === 1 && /\n {2}b\n/.test("\n" + r.out) && !/\n {2}a\n/.test("\n" + r.out), "an added violation in a second worker is reported, the first is not", r.out); }
{ const base = t({ a: bad }), head = t({ a: clean });
  const r = run(head, base);
  ok(r.code === 0, "removing a violation passes", r); }
{ const head = t({ a: clean });
  const r = run(head, path.join(tmpdir(), "mfg-does-not-exist-" + process.pid));
  ok(r.code === 2 && /base directory not found/.test(r.out), "a missing base directory exits 2 with a message", r); }
{ const head = t({ a: bad, b: clean });
  const r = run(head, null);
  ok(r.code === 1 && /REPO SOURCES \(1 workers/.test(r.out), "plain mode still reports the whole tree", r); }
{ const base = t({ a: clean }), head = t({ a: clean + '// notes: llama-3.3-70b-instruct-fp8-fast was removed from the ladder\n' });
  const r = run(head, base);
  ok(r.code === 0, "a banned model named in a trailing comment is documentation, not a violation", r); }
{ const head = [{ name: "a", hits: [{ label: "llama", line: 9, text: " x " }] }], base = [{ name: "a", hits: [{ label: "llama", line: 2, text: "x" }] }];
  ok(diffViolations(head, base).length === 0 && diffViolations(head, []).length === 1 && diffViolations([], base).length === 0, "diffViolations compares worker, label and trimmed text, not the line"); }
for (const d of dirs) rmSync(d, { recursive: true, force: true });
console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);
