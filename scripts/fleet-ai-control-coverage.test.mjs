import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const gaps = [];
let covered = 0;
for (const dir of readdirSync(root)) {
  const path = join(root, dir, "worker.js");
  if (!existsSync(path) || existsSync(join(root, dir, "RETIRED")) || existsSync(join(root, dir, "FOLDED"))) continue;
  const src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  // Only executable line prefixes, not comments describing the old binding.
  const body = src.split("// BEGIN FLEET-AI-CONTROL-1")[0];
  const rawRun = /(?:await\s+|return\s+|=\s*|deadline\(|withTimeout\(|^\s*)(?:this\.)?env\d*\.(AI|WAI)\.run\s*\(/m;
  if (rawRun.test(body)) gaps.push(`${dir}: ungated direct Workers AI dispatch`);
  if (/env\.(?:QNFO_AI|SVC_QNFO_AI|AI)\.fetch\([^\n]*(?:chat\/completions|\/infer|\/responses)/.test(body)) {
    gaps.push(`${dir}: ungated internal AI service dispatch`);
  }
  if (/fleetAiRun\(|fleetAiFetch\(|fleetAiServiceFetch\(/.test(body)) {
    covered++;
    assert.ok(src.includes("db.withSession(\"first-primary\")"), `${dir}: fresh primary read required`);
    const config = readFileSync(join(root, dir, "wrangler.toml"), "utf8");
    const binding = /var FLEET_AI_AUDIT_BINDING = "([^"]+)";/.exec(src)?.[1];
    assert.ok([...config.matchAll(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\[|$)/g)]
      .some(m => m[1].includes(`binding = "${binding}"`) && /database_name\s*=\s*"qnfo-audit"/.test(m[1])), `${dir}: gate must read qnfo-audit, not a similarly named database`);
    assert.equal(readFileSync(join(root, dir, "deployed-current.worker.js"), "utf8").replace(/\r\n/g, "\n"), src);
  }
}
console.log(`AI control instrumented workers: ${covered}`);
assert.deepEqual(gaps, [], `EMERGENCY CONTROL NOT DEPLOY-READY:\n${gaps.join("\n")}`);
