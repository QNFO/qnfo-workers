import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "qnfo-container-output-"));

try {
  const workerPath = path.join(tempDir, "worker.mjs");
  const source = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  fs.writeFileSync(workerPath, `${source}\nexport { pyCompile as testPyCompile };\n`);
  const { PyContainer, testPyCompile } = await import(pathToFileURL(workerPath).href);
  const encodeBuffer = (text) => new TextEncoder().encode(text).buffer;

  const containerWithOutput = (result) => ({
    running: true,
    start: async () => {},
    exec: async () => ({ output: async () => result }),
  });
  const pyContainer = (result) => new PyContainer({ container: containerWithOutput(result) }, {});
  const decoded = await pyContainer({
    exitCode: 0,
    stdout: encodeBuffer("COMPILE_OK\n"),
    stderr: encodeBuffer("compile warning\n"),
  }).run("print('COMPILE_OK')");
  assert.equal(decoded.stdout, "COMPILE_OK\n", "ArrayBuffer stdout is decoded");
  assert.equal(decoded.stderr, "compile warning\n", "ArrayBuffer stderr is decoded");
  assert.equal(decoded.exitCode, 0);

  const oversized = await pyContainer({
    exitCode: 0,
    stdout: encodeBuffer("x".repeat(65_537)),
    stderr: encodeBuffer("y".repeat(65_537)),
  }).run("print('large output')");
  assert.equal(oversized.stdout.length, 65_536, "stdout remains capped");
  assert.equal(oversized.stderr.length, 65_536, "stderr remains capped");
  assert.equal(oversized.stdoutTruncated, true);
  assert.equal(oversized.stderrTruncated, true);

  const legacyBytes = await pyContainer({
    exitCode: 0,
    stdout: new TextEncoder().encode("legacy stdout"),
    stderr: new TextEncoder().encode("legacy stderr"),
  }).run("print('legacy')");
  assert.equal(legacyBytes.stdout, "legacy stdout", "Uint8Array stdout remains supported");
  assert.equal(legacyBytes.stderr, "legacy stderr", "Uint8Array stderr remains supported");

  let compileCommand = "";
  const compileContainer = new PyContainer({
    container: {
      running: true,
      start: async () => {},
      exec: async (args) => {
        compileCommand = args[2];
        return {
          output: async () => ({
            exitCode: 0,
            stdout: encodeBuffer("COMPILE_OK\n"),
            stderr: encodeBuffer(""),
          }),
        };
      },
    },
  }, {});
  const env = {
    PY_CONTAINER: {
      idFromName: (name) => name,
      get: () => ({ fetch: (request) => compileContainer.fetch(request) }),
    },
  };
  const compiled = await testPyCompile(env, "value = 1\n");
  assert.equal(compileCommand.includes("print('COMPILE_OK')"), true, "compile verifier script is executed");
  assert.deepEqual(compiled, { ok: true }, "ArrayBuffer COMPILE_OK passes the Python verifier");
  console.log("PASS Container.exec ArrayBuffer output decoding and Python compile verification");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
