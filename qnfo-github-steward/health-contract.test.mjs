// HEALTH-CONTRACT-1 offline suite (agent_issues 2852, capability_contract_conformance). No network.
//
// qnfo-deploy-guard snapshots capabilities[] and limitations[] from every live worker's /health and qnfo-fleet-control grades the share
// that declare both non-empty (capability_contract_conformance, target 1). qnfo-github-steward answered /health without either list, so it
// was one of the two rows that held the metric at 0.9412 (capability_audit_snapshot 2026-10-20T03:00Z: capabilities "[]", limitations "[]").
// Run: node qnfo-github-steward/health-contract.test.mjs   (exit 0 = all passed)
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d !== undefined ? " :: " + JSON.stringify(d).slice(0, 300) : "")); } };

const src = readFileSync(join(here, "worker.js"), "utf8");
const tmp = join(mkdtempSync(join(tmpdir(), "hc-")), "w.mjs");
writeFileSync(tmp, src + "\nexport { VERSION as __v };\n");
const W = await import(pathToFileURL(tmp).href);

const res = await W.default.fetch(new Request("https://qnfo-github-steward.example/health"), {});
const h = await res.json();
ok(res.status === 200 && h.status === "ok" && h.worker === "qnfo-github-steward", "/health answers ok", h.status);
ok(h.version === W.__v, "/health reports the VERSION constant", h.version);
ok(Array.isArray(h.capabilities) && h.capabilities.length >= 5 && h.capabilities.every((c) => typeof c === "string" && c.length > 10), "/health declares at least five non-empty capabilities", h.capabilities);
ok(Array.isArray(h.limitations) && h.limitations.length >= 5 && h.limitations.every((c) => typeof c === "string" && c.length > 10), "/health declares at least five non-empty limitations", h.limitations);
ok(h.capabilities.some((c) => /^tracker-sync/.test(c)) && h.capabilities.some((c) => /^repo-reconcile/.test(c)), "the contract names the two loops the worker runs");
ok(h.limitations.some((l) => /^additive only/.test(l)), "the contract states what the worker refuses to do");
ok(h.scope && h.scope.org === "QNFO" && h.desired_repo && h.token_present === false, "the existing /health fields are still answered", h);
// A route the contract says is public must stay public: the contract is read without the steward key.
ok(/GET \/report and GET \/health are public reads/.test(src), "the header still says /health is a public read");
// The minimum version a deploy check can assert (a suite never pins an exact VERSION).
const [maj, min, pat] = String(W.__v).split("-")[0].split(".").map(Number);
ok(maj === 0 && (min > 7 || (min === 7 && pat >= 4)), "VERSION is at least 0.7.4", W.__v);

for (const name of ["qnfo-code-orchestrator", "qnfo-evolve"]) {
  const workerSrc = readFileSync(join(here, "..", name, "worker.js"), "utf8");
  const workerTmp = join(mkdtempSync(join(tmpdir(), "hc-")), "w.mjs");
  writeFileSync(workerTmp, workerSrc);
  const worker = await import(pathToFileURL(workerTmp).href);
  const response = await worker.default.fetch(new Request(`https://${name}.example/health`), {});
  const health = await response.json();
  ok(response.status === 200 && health.worker === name, `${name} /health answers for the worker`, health.worker);
  ok(Array.isArray(health.capabilities) && health.capabilities.length > 0 && health.capabilities.every((c) => typeof c === "string" && c.trim()), `${name} advertises capabilities`, health.capabilities);
  ok(Array.isArray(health.limitations) && health.limitations.length > 0 && health.limitations.every((l) => typeof l === "string" && l.trim()), `${name} advertises limitations`, health.limitations);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
