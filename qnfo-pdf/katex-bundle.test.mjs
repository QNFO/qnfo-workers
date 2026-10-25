import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

test("worker bundle embeds the locked KaTeX version and stays mirrored", () => {
  const lock = JSON.parse(readFileSync(join(here, "package-lock.json"), "utf8"));
  const renderer = readFileSync(join(here, "renderer.js"), "utf8");
  const worker = readFileSync(join(here, "worker.js"), "utf8");
  const mirror = readFileSync(join(here, "deployed-current.worker.js"), "utf8");
  const lockedVersion = lock.packages["node_modules/katex"]?.version;
  const bundledVersion = /\bvar version = "([^"]+)";/.exec(worker)?.[1];
  const stylesheetVersion = (source) =>
    /https:\/\/cdn\.jsdelivr\.net\/npm\/katex@([^/]+)\/dist\/katex\.min\.css/.exec(source)?.[1];

  assert.ok(lockedVersion, "KaTeX must be present in package-lock.json");
  assert.equal(bundledVersion, lockedVersion, "worker bundle must match the locked KaTeX version");
  assert.equal(stylesheetVersion(renderer), lockedVersion, "renderer stylesheet must match the locked KaTeX version");
  assert.equal(stylesheetVersion(worker), lockedVersion, "worker stylesheet must match the locked KaTeX version");
  assert.equal(mirror, worker, "deployed-current.worker.js must mirror worker.js exactly");
});
