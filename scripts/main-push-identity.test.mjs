import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { workflowPushPaths } from "./github-settings-actions.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const paths = workflowPushPaths(root);
assert.ok(paths.length > 0, "the push-path audit must find workflow writers");

const stepIndent = (text) => {
  const line = text.split("\n").find((value) => value.includes("uses: actions/checkout@"));
  assert.ok(line, "push workflow has a checkout step");
  return line.match(/^\s*/)[0].length;
};

const stepStarts = (lines, indent) => lines.flatMap((line, index) =>
  line.match(/^\s*/)[0].length === indent && /^\s*-\s/.test(line) ? [index] : []);

const stepForLine = (starts, line) => starts.filter((start) => start <= line).at(-1);
const pushSteps = new Set();
const byWorkflow = new Map();
for (const path of paths) {
  if (!byWorkflow.has(path.workflow)) byWorkflow.set(path.workflow, []);
  byWorkflow.get(path.workflow).push(path);
}

for (const [workflow, entries] of byWorkflow) {
  const text = readFileSync(join(root, ".github", "workflows", workflow), "utf8");
  const lines = text.split("\n");
  const indent = stepIndent(text);
  const starts = stepStarts(lines, indent);
  for (const entry of entries) {
    const index = entry.line - 1;
    const start = stepForLine(starts, index);
    assert.notEqual(start, undefined, `${workflow}:${entry.line} is in a workflow step`);
    const end = starts.find((next) => next > start) ?? lines.length;
    const block = lines.slice(start, end).join("\n");
    pushSteps.add(`${workflow}:${start}`);
    assert.match(block, /MAIN_PUSH_TOKEN:\s*\$\{\{\s*secrets\.QNFO_GH_PAT\s*\}\}/,
      `${workflow}:${entry.line} scopes the bypass token to its write step`);
    if (/git push/.test(entry.snippet)) {
      assert.match(block, /\[skip ci\]/, `${workflow}:${entry.line} keeps the generated commit non-recursive`);
      assert.match(entry.snippet, /https:\/\/x-access-token:\$\{MAIN_PUSH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git/,
        `${workflow}:${entry.line} pushes with the step-scoped identity`);
    }
    if (/push_artifact\.sh/.test(entry.snippet)) {
      assert.match(entry.snippet, /\[skip ci\]/, `${workflow}:${entry.line} marks helper commits non-recursive`);
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (!/MAIN_PUSH_TOKEN:/.test(lines[i])) continue;
    const start = stepForLine(starts, i);
    assert.ok(pushSteps.has(`${workflow}:${start}`), `${workflow}:${i + 1} does not expose the token outside a push step`);
  }
  for (const start of starts) {
    if (!/uses: actions\/checkout@/.test(lines[start])) continue;
    const end = starts.find((next) => next > start) ?? lines.length;
    assert.match(lines.slice(start, end).join("\n"), /persist-credentials:\s*false/,
      `${workflow}:${start + 1} does not persist the default checkout token`);
  }
  assert.doesNotMatch(lines.filter((line) => !/^\s*#/.test(line)).join("\n"), /git push origin HEAD:main/,
    `${workflow} has no remaining default-identity push`);
}

const pushHelper = readFileSync(join(root, "scripts", "push_artifact.sh"), "utf8");
assert.match(pushHelper, /git push -q "\$push_target" HEAD:main/);
assert.match(pushHelper, /case "\$msg" in \*"\[skip ci\]"\*/);
const canary = readFileSync(join(root, "scripts", "canary_revert.py"), "utf8");
assert.match(canary, /def main_push_target\(\):/);
assert.match(canary, /git\(\["push", push_target, "HEAD:main"\]\)/);
assert.match(canary, /title \+ " \[skip ci\]/);
const scratch = mkdtempSync(join(tmpdir(), "main-push-identity-"));
try {
  const bin = join(scratch, "bin");
  mkdirSync(bin);
  const capture = join(scratch, "git-args.txt");
  writeFileSync(join(bin, "git"), [
    "#!/bin/sh",
    "printf '<%s>\\n' \"$@\" >> \"$GIT_CAPTURE\"",
    "[ \"$1\" = diff ] && exit 1",
    "exit 0",
    "",
  ].join("\n"), { mode: 0o755 });
  writeFileSync(join(scratch, "artifact.json"), "{}");

  const run = (token, repository = "QNFO/qnfo-workers", message = "test artifact") => {
    rmSync(capture, { force: true });
    const env = { ...process.env, PATH: bin + delimiter + process.env.PATH, GIT_CAPTURE: capture, GITHUB_REPOSITORY: repository };
    if (token) env.MAIN_PUSH_TOKEN = token;
    else delete env.MAIN_PUSH_TOKEN;
    return spawnSync("bash", [join(root, "scripts", "push_artifact.sh"), message, "artifact.json"], {
      cwd: scratch, env, encoding: "utf8",
    });
  };

  let result = run("test-token");
  let args = readFileSync(capture, "utf8");
  assert.equal(result.status, 0, result.stderr);
  assert.match(args, /https:\/\/x-access-token:test-token@github\.com\/QNFO\/qnfo-workers\.git/);
  assert.match(args, /test artifact \[skip ci\]/);
  assert.doesNotMatch(result.stdout + result.stderr, /test-token/, "the helper does not print the token");

  result = run("");
  args = readFileSync(capture, "utf8");
  assert.equal(result.status, 0, result.stderr);
  assert.match(args, /<origin>\n<HEAD:main>/, "local runs retain the existing origin behavior");

  result = run("test-token", "invalid/repo/path");
  assert.equal(result.status, 2, "an authenticated push refuses an invalid repository name");
  assert.ok(!existsSync(capture), "invalid repository names fail before any Git command");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`main-push-identity: ${paths.length} audited push paths passed`);
