// BP26-PRODUCERS-1 offline suite: runs the selftest of the collector framework and of every scripts/bp26_<area>.py module.
// Convention: each module supports `python3 scripts/bp26_<area>.py --selftest` (offline, no network, no secrets) and exits 0 on success; a module that lacks it fails here, so a new
// collector cannot land without its own offline proof. Output MUST contain "0 failed" on success.   node scripts/bp26-producers.test.mjs
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mods = readdirSync(here).filter((f) => /^bp26_[a-z0-9_]+\.py$/.test(f) && !f.endsWith("_test.py")).sort();
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + String(d).slice(0, 600))); } };

ok(mods.includes("bp26_producers.py"), "the framework is present");
let py = null;
for (const cand of ["python3", "python"]) {
  const r = spawnSync(cand, ["--version"], { encoding: "utf8" });
  if (r.status === 0) { py = cand; break; }
}
ok(py !== null, "a python interpreter is available");
if (py) {
  for (const m of mods) {
    const r = spawnSync(py, [join(here, m), "--selftest"], { encoding: "utf8", timeout: 120000, env: { ...process.env, CLOUDFLARE_API_TOKEN: "", CF_API_TOKEN: "", GITHUB_TOKEN: "", GH_TOKEN: "" } });
    ok(r.status === 0, m + " --selftest exits 0", (r.stdout || "") + (r.stderr || ""));
  }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
