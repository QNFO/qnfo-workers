#!/usr/bin/env node
/**
 * HOTFIX 2026-09-13 - SELF-CONTAINED-1 (qnfo-observability 1.1.4 -> 1.1.5)
 *
 * SYMPTOM
 *   qnfo-observability/worker.js imports a sibling module:
 *       import { FLEET } from './fleet.js';
 *   The fleet's self-heal control plane (qnfo-fleet-deploy, VERSION 0.4.11) cannot
 *   be relied on to deploy that. Its redeploy() builds the upload as:
 *       fd.append("metadata", {main_module:"worker.js"});
 *       fd.append("worker.js", <canonical code>);
 *   i.e. ONLY worker.js. If `/content` replaces the module graph, `./fleet.js` is
 *   unresolvable, Cloudflare rejects the upload (cf. error 10021 seen for
 *   personal-companion and qnfo-cloud-ops), and the scan retries HOURLY FOREVER.
 *
 * EVIDENCE (live, qnfo-audit.fleet_deploys / fleet_drift_report, read 2026-09-13)
 *   - qnfo-backlog-exec 1.2.6->1.2.7, ai-health-prober 2.3.1->2.3.3,
 *     qnfo-social 0.5.2->0.5.3 : all ok=1, all SINGLE-FILE (worker.js only).
 *   - The only sibling-module worker ever deployed by the control plane is
 *     qnfo-fleet-dashboard 1.0.18->1.1.0 (ok=1, 2026-09-12 07:01:39) - and its
 *     canonical was PRE-BUNDLED: deployed-current.worker.js inlines
 *     `// registry.js` and `var REGISTRY = {...}` with NO import statement.
 *   So the sibling-import case is UNPROVEN on the control-plane path. This patch
 *   removes the dependency rather than betting on it.
 *
 * NOTE ON EVIDENCE QUALITY
 *   An earlier inference that "sibling imports break the control plane" was
 *   CONFOUNDED: both sibling-module workers were also never `canonical-ahead`
 *   (the healer only acts on `canonical-ahead`; `deployed-ahead` is reported and
 *   `continue`d). That inference was refuted as stated, then partially restored by
 *   the pre-bundled-canonical finding above. Net: unproven, not disproven.
 *
 * WHAT THIS DOES
 *   1. asserts `import { FLEET } from './fleet.js';` occurs EXACTLY once
 *   2. replaces it with an inlined FLEET const (same 80 names, same order)
 *   3. bumps VERSION '1.1.4' -> '1.1.5'
 *   4. re-reads the result and FAILS if any `import` statement remains
 *   Idempotent: a file with no import is reported and skipped.
 *
 * ROLLBACK: git checkout <prev-sha> -- worker.js && npx wrangler deploy
 *   (previous blob f22ca729f7faf2ef1633a7deead7bc426bc35ce4 = 1.1.3,
 *    3a5db9f761837b466357a29849b5912736fe7a48 = 1.1.4)
 */
import fs from "node:fs";

const P = process.argv[2] || "worker.js";
let s = fs.readFileSync(P, "utf8");

if (!/^\s*import\s/m.test(s)) {
  console.log("already self-contained (no import statement); no-op");
  process.exit(0);
}

const IMPORT_ANCHOR = "import { FLEET } from './fleet.js';";
const FLEET_NAMES = [
  "calendar-api","events-radar","fleet-executor","fleet-scheduler","jnl-referee","jnl-reviser",
  "jnl-watch","jnl-zenodo","job-market-watch","obsidian-writer","osf-integrity-check","personal-api",
  "personal-events-radar","personal-life-indexer","personal-life-maintain","personal-life-search",
  "qnfo-agent-orchestrator","qnfo-agent-ws","qnfo-ai","qnfo-ai-calibration","qnfo-ai-search",
  "qnfo-analytics","qnfo-archive","qnfo-arxiv-radar","qnfo-auditor","qnfo-backlog-exec",
  "qnfo-blank-audit","qnfo-chat-canary","qnfo-citation-watch","qnfo-cloud-ops","qnfo-code-agent",
  "qnfo-code-orchestrator","qnfo-container-executor","qnfo-containers-pilot","qnfo-ddocs-indexer",
  "qnfo-email","qnfo-email-orchestrator","qnfo-errata-orchestrator","qnfo-errata-publish",
  "qnfo-errata-respond","qnfo-errata-watch","qnfo-error-selfheal","qnfo-events","qnfo-fleet-advisor",
  "qnfo-fleet-calibrator","qnfo-fleet-dashboard","qnfo-fleet-deploy","qnfo-gateway",
  "qnfo-idea-factory","qnfo-idea-miner","qnfo-idea-triage","qnfo-impact","qnfo-infra",
  "qnfo-intent-orchestrator","qnfo-ipatent","qnfo-kaizen","qnfo-lifecycle","qnfo-memory-mcp",
  "qnfo-observability","qnfo-ops","qnfo-outreach","qnfo-paper-explainer","qnfo-paper-indexer",
  "qnfo-paper-reviser","qnfo-pdf","qnfo-pipeline-ops","qnfo-proof","qnfo-qwav",
  "qnfo-register-guard","qnfo-research-exec","qnfo-research-radar","qnfo-research-supervisor",
  "qnfo-skill-sync","qnfo-skills-discovery","qnfo-social","qnfo-thread-ingest","qnfo-tools-mcp",
  "qnfo-twin-maintain","research-daily-brief","qnfo-scorecard"
];

// Cross-check the inline list against fleet.js when it is present, so the two
// cannot silently diverge. Refuses to write on any difference.
if (fs.existsSync("fleet.js")) {
  const fj = fs.readFileSync("fleet.js", "utf8");
  const found = [...fj.matchAll(/"([a-z0-9][a-z0-9-]+)"/g)].map(m => m[1]);
  const want = found.filter(n => n !== "version" && n !== "captured_at" && n !== "note");
  const a = JSON.stringify(FLEET_NAMES), b = JSON.stringify(want);
  if (a !== b) {
    console.error("FAIL: inline FLEET list does not match fleet.js (" +
      FLEET_NAMES.length + " vs " + want.length + ") - no write performed");
    process.exit(1);
  }
  console.log("fleet.js cross-check OK: " + FLEET_NAMES.length + " names, identical order");
}

const n = s.split(IMPORT_ANCHOR).length - 1;
if (n !== 1) {
  console.error("FAIL: expected exactly 1 import anchor, found " + n + " - no write performed");
  process.exit(1);
}

const INLINE =
  "// FLEET registry snapshot (was ./fleet.js; captured from the Cloudflare Workers API 2026-09-10).\n" +
  "const FLEET = (\"" + FLEET_NAMES.join(" ") + "\").split(\" \");";

s = s.replace(IMPORT_ANCHOR, INLINE);

const vOld = "const VERSION = '1.1.4';";
if (s.split(vOld).length - 1 !== 1) {
  console.error("FAIL: VERSION anchor '1.1.4' not found exactly once - no write performed");
  process.exit(1);
}
s = s.replace(vOld, "const VERSION = '1.1.5';");

// FAIL-CLOSED post-check: no import may survive.
if (/^\s*import\s/m.test(s)) {
  console.error("FAIL: an import statement survived the patch - no write performed");
  process.exit(1);
}
if (s.indexOf("export default") < 0) {
  console.error("FAIL: 'export default' missing after patch - no write performed");
  process.exit(1);
}

fs.writeFileSync(P, s);
console.log("APPLIED SELF-CONTAINED-1 -> VERSION 1.1.5, " + Buffer.byteLength(s, "utf8") + " bytes");
console.log("next: node --input-type=module --check < worker.js && echo SYNTAX-OK");
