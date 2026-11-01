// MIRROR-GUARD-BUNDLE-1: import-using sources may differ from their Wrangler-built mirrors.
// Run: node scripts/mirror-guard.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./mirror-guard.py", import.meta.url));

function fixture(source, mirror) {
  const root = mkdtempSync(join(tmpdir(), "qnfo-mirror-guard-"));
  const scripts = join(root, "scripts");
  const worker = join(root, "example-worker");
  mkdirSync(scripts);
  mkdirSync(worker);
  copyFileSync(guard, join(scripts, "mirror-guard.py"));
  const sourcePath = join(worker, "worker.js");
  const mirrorPath = join(worker, "deployed-current.worker.js");
  writeFileSync(sourcePath, source);
  writeFileSync(mirrorPath, mirror);
  return {
    root,
    mirrorPath,
    run(...args) {
      return spawnSync("python3", [join(scripts, "mirror-guard.py"), ...args], {
        cwd: root,
        encoding: "utf8",
      });
    },
  };
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

{
  const source = `import { Buffer } from "node:buffer";\nvar VERSION = "1.2.0";\n${"// retained source documentation\n".repeat(100)}`;
  const mirror = 'var VERSION = "1.2.0";\n/* Wrangler bundle */\n';
  const f = fixture(source, mirror);
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /CONTENT-DIFF-REVIEW/);
  } finally {
    cleanup(f.root);
  }
}

{
  const source = 'var VERSION = "1.2.0";\nfunction current() { return 1; }\n';
  const mirror = 'var VERSION = "1.2.0";\nfunction stale() { return 0; }\n';
  const f = fixture(source, mirror);
  try {
    const result = f.run();
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.match(result.stdout, /CONTENT-DRIFT/);
  } finally {
    cleanup(f.root);
  }
}

{
  const source = 'import { Buffer } from "node:buffer";\nvar VERSION = "1.2.0";\n';
  const mirror = 'var VERSION = "1.1.0";\n/* previous build */\n';
  const f = fixture(source, mirror);
  try {
    const result = f.run("--fix");
    assert.equal(result.status, 1, result.stderr + result.stdout);
    assert.equal(readFileSync(f.mirrorPath, "utf8"), mirror);
  } finally {
    cleanup(f.root);
  }
}

console.log("3 passed, 0 failed");
