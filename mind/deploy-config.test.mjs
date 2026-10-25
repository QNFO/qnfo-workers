import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wrangler = readFileSync(join(here, "wrangler.toml"), "utf8");
const workflow = readFileSync(join(here, "..", ".github", "workflows", "mind-deploy.yml"), "utf8");
const configMain = wrangler.match(/^main\s*=\s*"([^"]+)"/m)?.[1];
const uploadMain = workflow.match(/META='\{"main_module":"([^"]+)"/)?.[1];

assert.ok(configMain, "mind/wrangler.toml declares a main entrypoint");
assert.ok(uploadMain, "mind-deploy.yml declares the API upload main module");
assert.equal(configMain, uploadMain, "Wrangler fallback and API upload use the same main module");
assert.ok(existsSync(join(here, configMain)), `Wrangler main entrypoint exists: ${configMain}`);
assert.match(workflow, /sed .*mind\/wrangler\.toml > mind\/wrangler\.deploy\.toml/, "fallback generates its config from mind/wrangler.toml");
assert.match(workflow, /wrangler@3 deploy --config mind\/wrangler\.deploy\.toml/, "fallback deploys with the generated config");

console.log("mind deploy config regression checks passed");
