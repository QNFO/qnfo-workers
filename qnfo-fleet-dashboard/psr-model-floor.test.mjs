import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "worker.js"), "utf8");
const mirror = readFileSync(path.join(here, "deployed-current.worker.js"), "utf8");
const policy = JSON.parse(readFileSync(path.join(here, "..", "scripts", "model-policy.json"), "utf8"));

function freeModel(text, file) {
  const match = /^var PSR_FREE_MODEL = ("(?:\\.|[^"])*");$/m.exec(text);
  assert.ok(match, `${file} must declare PSR_FREE_MODEL`);
  return { literal: match[1], value: JSON.parse(match[1]) };
}

const sourceModel = freeModel(source, "worker.js");
const mirrorModel = freeModel(mirror, "deployed-current.worker.js");

assert.equal(mirrorModel.literal, sourceModel.literal, "deployed mirror must use the source free model");
assert.ok(policy.allowed.some((model) => model.wa === sourceModel.value),
  `${sourceModel.value} must be in the model-floor allowlist`);
assert.match(source, /const models = freeOnly \? \[PSR_FREE_MODEL\] : \[PSR_FREE_MODEL, PSR_PAID_MODEL\];/,
  "free-only runs use the permitted free model and ordinary runs retain the paid fallback");

console.log("PSR_FREE_MODEL is allowed, mirrored, and preserves fallback behavior");
