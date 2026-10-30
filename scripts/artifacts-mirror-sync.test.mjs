// ARTIFACTS-REDUNDANCY-1 offline suite for scripts/artifacts-mirror-sync.py, against a local bare repository as the remote.
// Proves: a first run pushes HEAD to the dedicated branch and reads it back; a second run is up to date; a new commit fast-forwards; a remote that holds a commit the source does not
// is refused (exit 2) and left unchanged, never forced; a shallow checkout is refused; main as the mirror branch and a remote that is not an Artifacts https URL are refused (exit 4);
// no token skips with a warning and exit 0 (exit 5 with --require) and touches nothing; the token never appears in the output; the workflow file names the script and the secret.
// Run: node scripts/artifacts-mirror-sync.test.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const script = fileURLToPath(new URL("./artifacts-mirror-sync.py", import.meta.url));
const TOKEN = "art_v1_SECRETTOKEN0123456789abcdef";
const sh = (cmd, args, cwd, env) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.org", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.org", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...(env || {}) } });
const g = (cwd, ...a) => { const r = sh("git", a, cwd); if (r.status !== 0) throw new Error("git " + a.join(" ") + ": " + r.stderr); return r.stdout.trim(); };
const root = mkdtempSync(join(tmpdir(), "mirror-"));
const src = join(root, "src"), bare = join(root, "remote.git"), other = join(root, "other");
g(root, "init", "-q", "-b", "main", src);
g(root, "init", "-q", "--bare", "-b", "main", bare);
const commit = (dir, name) => { writeFileSync(join(dir, name), name + "\n"); g(dir, "add", "-A"); g(dir, "commit", "-q", "-m", name); return g(dir, "rev-parse", "HEAD"); };
commit(src, "a.txt");
const c2 = commit(src, "b.txt");
const run = (args, env, cwd) => { const r = sh("python3", [script, ...args], cwd || src, env); return { code: r.status, out: (r.stdout || "") + (r.stderr || "") }; };
const E = { ARTIFACTS_TOKEN: TOKEN };
const A = ["--remote", bare, "--allow-local"];
const refOf = () => {
  const r = sh("git", ["--git-dir=" + bare, "rev-parse", "--verify", "refs/heads/github-main"], root);
  if (r.status !== 0) throw new Error("Cannot verify mirror ref: " + r.stderr);
  return r.stdout.trim();
};

let r = run(A, E);
ok(r.code === 0 && /pushed/.test(r.out) && refOf() === c2, "first run pushes HEAD to the mirror branch and reads it back", r);
r = run(A, E);
ok(r.code === 0 && /up to date/.test(r.out), "a second run is up to date", r);
const c3 = commit(src, "c.txt");
r = run(A, E);
ok(r.code === 0 && refOf() === c3, "a new commit fast-forwards the mirror", r);
ok(!r.out.includes("SECRETTOKEN") && !run(A, E).out.includes("SECRETTOKEN"), "the token never appears in the output");

// a remote holding a commit the source does not: refused, unchanged, never forced
g(root, "clone", "-q", bare, other);
g(other, "checkout", "-q", "-b", "github-main", "origin/github-main");
const foreign = commit(other, "foreign.txt");
g(other, "push", "-q", "origin", "github-main");
commit(src, "d.txt");
r = run(A, E);
ok(r.code === 2 && /diverged|not an ancestor/.test(r.out) && refOf() === foreign, "a diverged remote is refused (exit 2) and left unchanged, never forced", r);
ok(run([...A, "--force"], E).code !== 0, "there is no --force");

// guards
r = run([...A, "--branch", "main"], E);
ok(r.code === 4 && refOf() === foreign, "main is never the mirror branch (exit 4)", r);
r = run(["--remote", "https://evil.example/x/y.git"], E);
ok(r.code === 4, "a remote that is not an Artifacts https URL is refused (exit 4)", r);
r = run(["--remote", "https://edb167b78c9fb901ea5bca3ce58ccc4b.artifacts.cloudflare.net/git/qnfo/fleet-artifacts.git"], {});
ok(r.code === 0 && /::warning/.test(r.out) && /ARTIFACTS_TOKEN is not set/.test(r.out), "no token skips with a warning and exit 0, touching nothing", r);
r = run(["--require", "--remote", "https://edb167b78c9fb901ea5bca3ce58ccc4b.artifacts.cloudflare.net/git/qnfo/fleet-artifacts.git"], {});
ok(r.code === 5, "--require turns a missing token into exit 5", r);

// shallow checkout
const shallow = join(root, "shallow");
g(root, "clone", "-q", "--depth", "1", "file://" + src, shallow);
r = run(["--remote", bare, "--allow-local", "--branch", "other-mirror"], E, shallow);
ok(r.code === 2 && /shallow/.test(r.out), "a shallow checkout is refused", r);

// the workflow
const wf = readFileSync(new URL("../.github/workflows/artifacts-mirror-sync.yml", import.meta.url), "utf8");
ok(/scripts\/artifacts-mirror-sync\.py/.test(wf) && /secrets\.ARTIFACTS_TOKEN/.test(wf) && /fetch-depth: 0/.test(wf) && /contents: read/.test(wf) && /workflow_dispatch/.test(wf) && !/--force|push -f/.test(wf), "the workflow runs the script with the secret, full history and read-only contents");
console.log("artifacts-mirror-sync: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
