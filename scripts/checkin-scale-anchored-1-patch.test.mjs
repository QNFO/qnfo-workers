// REAL-PROBES-3 offline suite for scripts/checkin-scale-anchored-1-patch.py (agent_issues 100320, APPLIER-ROT-ERROR).
// ci-status/applier-doctor.json listed the script under "errored": the patch landed long ago (personal-companion carries SCALE-ANCHORED-1 and the worker VERSION moved on to
// 1.37.2), so the first two steps print "already applied" and the third, the VERSION bump, died with "FAIL-CLOSED: ... VERSION anchor not found" because neither of the two version
// strings the script knows (1.29.0, 1.30.0) is in the worker any more. A patch that is on main must exit 0 and say so; a worker that has neither the marker nor a known version must
// still die closed; a fresh tree must still be patched.
// This suite copies the script into a temporary tree (the script resolves personal-companion/ from its own location) with minimal fixtures and proves
//   1. a tree that carries the patch and a later VERSION: exit 0, "already applied", nothing written (the old script exits 1 with FAIL-CLOSED);
//   2. a worker that carries neither the marker nor either version string still dies closed (exit 1), and nothing is written;
//   3. a fresh tree is still patched (wire, the check-in guard in wellbeing.test.mjs, VERSION 1.29.0 -> 1.30.0), and a second run changes nothing;
//   4. a worker already at 1.30.0 stays "already bumped", and a missing target still dies closed;
//   5. end to end, scripts/applier-doctor.py run over a throwaway git tree classifies the script already-applied (the old script: error), which is what removes it from the
//      "errored" list of ci-status/applier-doctor.json on the next run on main.
// Run: node --no-warnings scripts/checkin-scale-anchored-1-patch.test.mjs
//   CSA_SCRIPT=<file> runs the same checks against another copy of the script (the pre-change file): the first and the fifth group must then fail.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const SCRIPT = process.env.CSA_SCRIPT ? resolve(process.env.CSA_SCRIPT) : join(here, "checkin-scale-anchored-1-patch.py");
const DOCTOR = join(here, "applier-doctor.py");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const norm = (t) => String(t).replace(/\r\n/g, "\n");

const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
ok(PY !== null, "a python 3 interpreter is available");
const GIT = spawnSync("git", ["--version"], { encoding: "utf8" }).status === 0;
ok(GIT, "git is available for the applier-doctor check");
if (PY === null) { console.log(pass + " passed, " + fail + " failed"); process.exit(1); }

// the script's own anchors and replacement texts, read from the script so the fixtures stay in step with it
const K = (() => {
  const code = "import importlib.util, json, sys\nspec = importlib.util.spec_from_file_location('csa', sys.argv[1])\nm = importlib.util.module_from_spec(spec)\nspec.loader.exec_module(m)\n" +
    "print(json.dumps({k: getattr(m, k) for k in ['MARK', 'OLD_VER', 'NEW_VER', 'BTNS_OLD', 'MOOD_OLD', 'ENERGY_OLD', 'CSS_OLD', 'MAIL_OLD', 'BRIEF_OLD', 'API_OLD', 'TEST_OLD', 'TEST_NEW']}))";
  const r = spawnSync(PY, ["-I", "-c", code, SCRIPT], { encoding: "utf8" });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return null; }
})();
ok(K !== null && K.MARK === "SCALE-ANCHORED-1" && K.OLD_VER.includes("1.29.0") && K.NEW_VER.includes("1.30.0"), "the script's constants were read (marker SCALE-ANCHORED-1, versions 1.29.0 and 1.30.0)", K && Object.keys(K));
if (K === null) { console.log(pass + " passed, " + fail + " failed"); process.exit(1); }

const WIRE_OLD = ["// wellbeing wire fixture", K.BTNS_OLD, K.MOOD_OLD, K.ENERGY_OLD, K.CSS_OLD, "const mail = " + K.MAIL_OLD + ";", "const brief = " + K.BRIEF_OLD + ";", "function api(check) {", "  return {", "    checked_in: check.mood !== undefined || check.energy !== undefined", "  };", "}", ""].join("\n");
const WIRE_NEW = "// wellbeing wire fixture\n// " + K.MARK + ": every rung carries the word it means\nconst MOOD_WORDS = [\"rough\", \"low\", \"okay\", \"good\", \"great\"];\n";
const WORKER_OLD = "// worker\n" + K.OLD_VER + "\nexport default {};\n";
const WORKER_PAST = "// worker\nvar VERSION = \"1.37.2-owner-mail-q08\"; // later releases replaced the version line\n// " + K.MARK + " stays in the worker as a comment\nexport default {};\n";
const WORKER_UNRELATED = "// worker\nvar VERSION = \"1.37.2-owner-mail-q08\";\nexport default {};\n";
const TEST_OLDER = "ok(\"check-in page renders its body\", " + K.TEST_OLD + ", body);\n";
const TEST_NEWER = "ok(\"check-in page renders its body\", " + K.TEST_NEW + ", body);\n";

// a throwaway tree: <tree>/scripts/<script copy> and <tree>/personal-companion/{wellbeing-wire.js,worker.js,wellbeing.test.mjs}
const mk = ({ wire, worker, test }) => {
  const tree = mkdtempSync(join(tmpdir(), "csa-"));
  mkdirSync(join(tree, "scripts"), { recursive: true });
  mkdirSync(join(tree, "personal-companion"), { recursive: true });
  copyFileSync(SCRIPT, join(tree, "scripts", "checkin-scale-anchored-1-patch.py"));
  if (wire !== null) writeFileSync(join(tree, "personal-companion", "wellbeing-wire.js"), wire);
  if (worker !== null) writeFileSync(join(tree, "personal-companion", "worker.js"), worker);
  if (test !== null) writeFileSync(join(tree, "personal-companion", "wellbeing.test.mjs"), test);
  return tree;
};
const read = (tree, f) => norm(readFileSync(join(tree, "personal-companion", f), "utf8"));
const snapshot = (tree) => JSON.stringify(["wellbeing-wire.js", "worker.js", "wellbeing.test.mjs"].map((f) => (existsSync(join(tree, "personal-companion", f)) ? read(tree, f) : null)));
const run = (tree) => {
  const r = spawnSync(PY, [join(tree, "scripts", "checkin-scale-anchored-1-patch.py")], { encoding: "utf8", cwd: tree });
  return { rc: r.status, out: norm(String(r.stdout || "") + String(r.stderr || "")) };
};

// ---- 1. the patch is on main and the worker VERSION moved on: the real state of personal-companion today ----
{
  const tree = mk({ wire: WIRE_NEW, worker: WORKER_PAST, test: TEST_NEWER });
  const before = snapshot(tree);
  const r = run(tree);
  ok(r.rc === 0, "a tree that carries the patch and a later VERSION exits 0 (the old script exits 1: FAIL-CLOSED, VERSION anchor not found)", r);
  ok(!/FAIL-CLOSED/.test(r.out) && /already applied .*worker\.js/.test(r.out), "it says the worker is already applied and does not fail closed", r.out);
  ok(/already applied .*wellbeing-wire\.js/.test(r.out), "it also says the wire file is already applied", r.out);
  ok(snapshot(tree) === before, "nothing is written to the worker, the wire file or the check-in guard");
}

// ---- 2. neither the marker nor a known version: still fail closed ----
{
  const tree = mk({ wire: WIRE_NEW, worker: WORKER_UNRELATED, test: TEST_NEWER });
  const before = snapshot(tree);
  const r = run(tree);
  ok(r.rc === 1 && /FAIL-CLOSED: .*worker\.js: VERSION anchor not found/.test(r.out), "a worker with neither the marker nor either version string still exits 1 with FAIL-CLOSED", r);
  ok(snapshot(tree) === before, "and writes nothing");
}

// ---- 3. a fresh tree is patched, and the second run is a no-op ----
{
  const tree = mk({ wire: WIRE_OLD, worker: WORKER_OLD, test: TEST_OLDER });
  const r1 = run(tree);
  ok(r1.rc === 0 && /patched .*wellbeing-wire\.js/.test(r1.out) && /bumped .*worker\.js/.test(r1.out), "a fresh tree exits 0 and reports patched and bumped", r1);
  const wire = read(tree, "wellbeing-wire.js");
  ok(wire.includes(K.MARK) && wire.includes("MOOD_WORDS") && wire.includes("ENERGY_WORDS") && !wire.includes(K.BTNS_OLD), "the wire file carries the marker and the anchored scale and lost the bare button row");
  ok(read(tree, "worker.js").includes(K.NEW_VER) && !read(tree, "worker.js").includes(K.OLD_VER), "the worker VERSION went from 1.29.0 to 1.30.0");
  ok(read(tree, "wellbeing.test.mjs").includes(K.TEST_NEW) && !read(tree, "wellbeing.test.mjs").includes(K.TEST_OLD), "the check-in guard in wellbeing.test.mjs asserts the anchored labels");
  const after1 = snapshot(tree);
  const r2 = run(tree);
  ok(r2.rc === 0 && !/FAIL-CLOSED/.test(r2.out) && /already applied .*wellbeing-wire\.js/.test(r2.out) && /already bumped .*worker\.js/.test(r2.out), "the second run exits 0 and reports already applied and already bumped", r2);
  ok(snapshot(tree) === after1, "the second run writes nothing");
}

// ---- 4. already bumped, and a missing target ----
{
  const tree = mk({ wire: WIRE_NEW, worker: "// worker\n" + K.NEW_VER + "\n", test: TEST_NEWER });
  const r = run(tree);
  ok(r.rc === 0 && /already bumped .*worker\.js/.test(r.out), "a worker at 1.30.0 stays 'already bumped'", r);
  const gone = mk({ wire: WIRE_NEW, worker: null, test: TEST_NEWER });
  const rg = run(gone);
  ok(rg.rc === 1 && /FAIL-CLOSED: missing .*worker\.js/.test(rg.out), "a missing worker.js still dies closed", rg);
  const noGuard = mk({ wire: WIRE_NEW, worker: WORKER_PAST, test: "// no guard line here\n" });
  const rn = run(noGuard);
  ok(rn.rc === 1 && /guard anchor not found/.test(rn.out), "a check-in guard that is neither the old nor the new line still dies closed", rn);
}

// ---- 5. applier-doctor over a throwaway git tree ----
if (GIT) {
  const doctorVerdict = (tree) => {
    const g = (...a) => spawnSync("git", ["-c", "user.name=csa", "-c", "user.email=csa@example.invalid", "-c", "core.autocrlf=false", ...a], { cwd: tree, encoding: "utf8" });
    g("init", "-q");
    g("add", "-A");
    g("commit", "-q", "-m", "fixture");
    const env = Object.assign({}, process.env, { REPO_ROOT: tree, APPLIER_DOCTOR_TIMEOUT: "60" });
    const r = spawnSync(PY, [DOCTOR], { cwd: tree, encoding: "utf8", env });
    let rep = null, raw = "";
    try { raw = readFileSync(join(tree, "ci-status", "applier-doctor.json"), "utf8"); rep = JSON.parse(raw); } catch (e) { rep = null; }
    return { rc: r.status, rep, raw, out: String(r.stdout || "") + String(r.stderr || "") };
  };
  const tree = mk({ wire: WIRE_NEW, worker: WORKER_PAST, test: TEST_NEWER });
  const d = doctorVerdict(tree);
  const name = "scripts/checkin-scale-anchored-1-patch.py";
  ok(d.rep !== null && d.rep.total === 1, "applier-doctor ran over the throwaway tree and scanned the one patch script", d.out.slice(-300));
  ok(d.rep !== null && !d.rep.errored.includes(name) && d.rep.counts["already-applied"] === 1, "the doctor classifies the script already-applied: it is not in the errored list", d.rep);
  ok(d.raw.length > 0 && !d.raw.includes("\"errored\": [\"" + name + "\"") && !d.raw.includes("\"" + name + "\""), "the written ci-status/applier-doctor.json text does not name the script in any list (the text the 100320 contract probes for)", d.raw.slice(0, 300));
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
