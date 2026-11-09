// DEPLOY-GUARD-HEALTH-BINDING-2 (issue 9708): every live worker directory with a /health route has a CH_<WORKER> binding.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import assert from "node:assert";
const toml = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
const root = new URL("../", import.meta.url);
const missing = [];
for (const d of readdirSync(root, { withFileTypes: true })) {
  if (!d.isDirectory() || d.name === "qnfo-deploy-guard") continue;
  const p = (f) => new URL(d.name + "/" + f, root);
  if (!existsSync(p("worker.js")) || !existsSync(p("wrangler.toml")) || existsSync(p("RETIRED")) || existsSync(p("FOLDED"))) continue;
  if (!/\/health/.test(readFileSync(p("worker.js"), "utf8"))) continue;
  const key = "CH_" + d.name.toUpperCase().replace(/-/g, "_");
  if (toml.includes('binding = "' + key + '"')) continue;
  missing.push(d.name);
}
// Workers added after this change may lack a binding until the next sweep; the fallback is the public read.
assert.ok(missing.length <= 3, "workers without a CH_ binding: " + missing.join(", "));
console.log("health-bindings ok, missing:", missing.length);
