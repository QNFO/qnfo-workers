// MODEL-FLOOR-PREMERGE-1 (agent_issues 100121) offline suite for scripts/model-floor-guard.mjs pull-request mode. Builds a base tree and a
// head tree of worker.js files in temp directories and runs the real CLI with --base. Proves: a banned model added to a worker string
// fails with exactly that violation; debt already on the base does not fail an unrelated change; a hit that only moves lines is not new;
// an added violation in a second worker is reported with the first untouched; a missing base directory exits 2; the plain mode still
// reports the whole tree; comment mentions stay documentation. FOLDED-AND-RETIRED-MODEL-COVERAGE-1 (agent_issues 2831): a RETIRED directory is
// not scanned and a FOLDED member's findings name the host bundle. MODEL-POLICY-SINGLE-SOURCE-1 (agent_issues 2833): scripts/model-policy.json
// carries an `allowed` table the guard reads next to BANNED. Run: node scripts/model-floor-guard.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { diffViolations, foldedHost, validateAllowed, BANNED } from "./model-floor-guard.mjs";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " :: " + JSON.stringify(d).slice(0, 400) : "")); } };
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "model-floor-guard.mjs");
// A value is the worker.js text, or an object of file name -> text for a directory that also carries a RETIRED or FOLDED marker.
const mk = (files) => { const root = mkdtempSync(path.join(tmpdir(), "mfg-")); for (const [w, body] of Object.entries(files)) { mkdirSync(path.join(root, w)); const fs_ = typeof body === "string" ? { "worker.js": body } : body; for (const [n, text] of Object.entries(fs_)) writeFileSync(path.join(root, w, n), text); } return root; };
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

// ---- FOLDED-AND-RETIRED-MODEL-COVERAGE-1 (agent_issues 2831) ----
const RETIRED = "x is RETIRED (2026-10-01): not deployed.\n";
const FOLDED = "x is FOLDED into host (2026-10-06, FOLD-KIT-1): its code runs unchanged as a member inside host/worker.js.\n";
{ const head = t({ a: clean, gone: { "worker.js": bad, RETIRED } });
  const r = run(head, null);
  ok(r.code === 0 && !/^ {2}gone\b/m.test(r.out) && /1 RETIRED directories not scanned/.test(r.out), "a banned model id inside a RETIRED directory is not scanned", r); }
{ const head = t({ a: clean, gone: bad }); // the same code without the marker is a violation, so the skip is the marker's doing
  const r = run(head, null);
  ok(r.code === 1 && /^ {2}gone\b/m.test(r.out), "the same source without a RETIRED marker is still reported", r); }
{ const base = t({ a: clean }), head = t({ a: clean, gone: { "worker.js": bad, RETIRED } });
  const r = run(head, base);
  ok(r.code === 0 && /0 workers with new/.test(r.out), "pull-request mode ignores a RETIRED directory the change adds", r); }
{ const base = t({ gone: { "worker.js": bad, RETIRED } }), head = t({ gone: bad }); // the marker removed to get a hit through is a new violation
  const r = run(head, base);
  ok(r.code === 1 && /^ {2}gone\b/m.test(r.out), "removing a RETIRED marker from a directory with a banned model is reported as added", r); }
{ const head = t({ host: clean, member: { "worker.js": bad, FOLDED } });
  const r = run(head, null, ["--json"]);
  let j = {}; try { j = JSON.parse(r.out); } catch {}
  const row0 = (j.repo || []).find((x) => x.name === "member");
  ok(r.code === 1 && row0 && row0.folded === true && row0.host === "host", "a FOLDED member's finding names its host bundle", r.out);
  ok(JSON.stringify(j.artifacts) === JSON.stringify([{ artifact: "host", own: 0, members: [{ name: "member", hits: 1 }] }]), "the findings roll up per deployed artifact with the member named", j.artifacts);
  const p = run(head, null);
  ok(/member \(FOLDED into host\)/.test(p.out) && /BY DEPLOYED ARTIFACT/.test(p.out) && /host: 0 own hits; members member 1/.test(p.out), "the text report names the host and rolls the member up", p.out); }
{ const head = t({ member: { "worker.js": bad, FOLDED: "member is FOLDED (2026-10-01). Duties now run inside existing workers.\n" } });
  const r = run(head, null, ["--json"]);
  let j = {}; try { j = JSON.parse(r.out); } catch {}
  ok(r.code === 1 && j.repo && j.repo[0].folded === true && j.repo[0].host === null && j.artifacts[0].artifact === "(unnamed host)", "a FOLDED member with no named host is still scanned and rolls up under an unnamed host", r.out); }
{ const dirs2 = new Set(["idea-hub", "qnfo-idea-triage"]);
  ok(foldedHost("qnfo-ai-calibration is FOLDED into qnfo-ai-calibration (2026-10-06)", dirs2) === "qnfo-ai-calibration"
    && foldedHost("folded into qnfo-fleet-control 2026-10-01: calibratorMod is mounted at /cal", dirs2) === "qnfo-fleet-control"
    && foldedHost("Its duties live in idea-hub: idea-hub embeds the intake triage", dirs2) === "idea-hub"
    && foldedHost("Its duties live in nowhere-dir: x", dirs2) === null
    && foldedHost("its duties now run inside existing workers", dirs2) === null
    && foldedHost("", dirs2) === null, "foldedHost reads the host from the marker text and only trusts a named worker directory for the 'duties live in' form"); }

// ---- MODEL-POLICY-SINGLE-SOURCE-1 (agent_issues 2833) ----
const policyFile = path.join(path.dirname(script), "model-policy.json");
const POLICY = JSON.parse(readFileSync(policyFile, "utf8"));
{ const rows = POLICY.allowed;
  ok(Array.isArray(rows) && rows.length >= 5, "scripts/model-policy.json carries an allowed table", rows && rows.length);
  ok(Array.isArray(rows) && rows.every((r) => typeof r.id === "string" && typeof r.family === "string" && /^@cf\/[\w.-]+\/[\w.-]+$/.test(r.wa) && Number.isInteger(r.ctx) && r.ctx > 0 && typeof r.reasoning === "boolean"), "every allowed row has id, family, wa, ctx and reasoning of the right type");
  ok(Array.isArray(rows) && new Set(rows.map((r) => r.id)).size === rows.length && new Set(rows.map((r) => r.wa)).size === rows.length, "allowed ids and wa ids are unique");
  ok(Array.isArray(rows) && rows.every((r) => !BANNED.some((b) => b.re.test(r.id) || b.re.test(r.wa))), "no allowed row matches a BANNED rule");
  ok(Array.isArray(rows) && new Set(rows.map((r) => r.family)).size >= 4, "the allowed table keeps at least four vendor families (panels count families)"); }
{ ok(validateAllowed([{ id: "x", family: "f", wa: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", ctx: 1, reasoning: false }]).some((p) => /conflicts with BANNED \[llama\]/.test(p)), "validateAllowed rejects a row that re-admits a BANNED model");
  ok(validateAllowed([{ id: "x", family: "f", wa: "nope", ctx: 0, reasoning: "no" }]).length === 3, "validateAllowed rejects a malformed row (wa, ctx, reasoning)"); }
const pol = (rows) => { const d = mkdtempSync(path.join(tmpdir(), "mfgp-")); dirs.push(d); const f = path.join(d, "policy.json"); writeFileSync(f, JSON.stringify({ version: 1, workers: {}, allowed: rows })); return f; };
const prow = (wa) => ({ id: wa.split("/").pop(), family: "acme", wa, ctx: 1000, reasoning: true });
{ const head = t({ a: clean });
  const r = run(head, null, ["--policy", pol([prow("@cf/meta/llama-3.3-70b-instruct-fp8-fast")])]);
  ok(r.code === 2 && /MODEL POLICY/.test(r.out) && /conflicts with BANNED \[llama\]/.test(r.out), "the guard reads the allowed table and exits 2 on a row that conflicts with BANNED", r); }
{ const head = t({ a: 'var M = "@cf/zai-org/glm-5.3-flash";\nvar N = "@cf/acme/new-model-9b";\n', b: clean });
  const listed = pol([prow("@cf/zai-org/glm-5.3-flash")]);
  const r = run(head, null, ["--strict-allowed", "--policy", listed]);
  ok(r.code === 1 && /^ {2}a$/m.test(r.out) && /@cf\/acme\/new-model-9b/.test(r.out) && !/L1 @cf\/zai-org/.test(r.out), "--strict-allowed fails on a pinned @cf/ id that is not in the table and not on a listed one", r.out);
  const r2 = run(head, null, ["--unlisted", "--policy", listed]);
  ok(r2.code === 0 && /1 workers pin an @cf\/ id that is not in the allowed table of 1 models/.test(r2.out), "--unlisted reports the same id without failing the run", r2.out);
  const r3 = run(head, null, ["--strict-allowed", "--policy", pol([prow("@cf/zai-org/glm-5.3-flash"), prow("@cf/acme/new-model-9b")])]);
  ok(r3.code === 0, "adding the id to the table clears it", r3.out);
  const r4 = run(head, null);
  ok(r4.code === 0 && !/UNLISTED/.test(r4.out), "without the flags an unlisted id is not reported (the default scan is unchanged)", r4.out); }
{ const base = t({ a: 'var M = "@cf/acme/old-model-9b";\n' }), head = t({ a: 'var M = "@cf/acme/old-model-9b";\nvar N = "@cf/acme/new-model-9b";\n' });
  const r = run(head, base, ["--strict-allowed", "--policy", pol([])]);
  ok(r.code === 1 && /new-model-9b/.test(r.out) && !/old-model-9b/.test(r.out), "pull-request mode with --strict-allowed reports only the unlisted id the change adds", r.out); }
{ const head = t({ a: 'var E = "@cf/baai/bge-m3";\n// "@cf/acme/in-a-comment-9b"\nvar MODEL_RATES = { "@cf/acme/priced-9b": [1, 2] };\nvar M = "@cf/acme/real-9b"; // @cf/acme/trailing-9b\n' });
  const r = run(head, null, ["--unlisted", "--policy", pol([])]);
  ok(/real-9b/.test(r.out) && !/bge-m3|in-a-comment|priced-9b|trailing-9b/.test(r.out), "embedding ids, comments and price rows are not counted as unlisted selections", r.out); }
for (const d of dirs) rmSync(d, { recursive: true, force: true });
console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);
