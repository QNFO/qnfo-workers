/**
 * fm7-health-parity.test.mjs -- FM7-PARITY-SCHEMA-VERSION-1 (2026-10-26, agent_issues 1000273).
 *
 * opsDeploy refuses a bundle whose /health returns a hardcoded version literal that differs from its single VERSION const
 * (FM7-HEALTH-VERSION-PARITY-1). The scan matched `version:` without a word boundary, so `schema_version: "fleet-managers/v1"` in an
 * ok:true object (qnfo-fleet-dashboard /api/managers) refused qnfo-fleet-dashboard 1.64.0 and the canonical deploy fell back to the
 * code-only path, which installs no new bindings. The regex is read out of worker.js, so this test cannot drift from the code.
 *
 *   node qnfo-ops/fm7-health-parity.test.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const m = src.match(/const _hrx = (\/\(\?:ok:.*\/g);/);
let passed = 0, failed = 0;
const ok = (c, label, extra) => { if (c) passed++; else { failed++; console.error("FAIL " + label + (extra !== undefined ? "  -- " + JSON.stringify(extra) : "")); } };
ok(!!m, "the FM7 parity regex is found in worker.js");
const make = () => new RegExp(m[1].slice(1, m[1].lastIndexOf("/")), "g");
const literals = (text) => { const rx = make(); const out = []; let x; while ((x = rx.exec(text)) !== null) out.push(x[1]); return out; };

ok(literals('{ ok: true, schema_version: "fleet-managers/v1", managers: [] }').length === 0, "schema_version is not a health version");
ok(JSON.stringify(literals('{ ok: true, version: "1.2.3" }')) === '["1.2.3"]', "a literal version key is still read");
ok(JSON.stringify(literals('{ ok: true, service: "x", worker: "y", version: "9.9.9" }')) === '["9.9.9"]', "a literal after other keys is still read");
ok(JSON.stringify(literals('{ ok: true, schema_version: "a", version: "2.0.0" }')) === '["2.0.0"]', "schema_version is skipped and the real version key after it is read");
ok(literals("{ ok: true, version: VERSION }").length === 0, "the VERSION identifier is not a literal");
ok(literals('{ ok: true, api_version: "v2", protocol_version: "1", $version: "z" }').length === 0, "api_version, protocol_version and $version are other keys");
ok(JSON.stringify(literals('{ status: "ok", version: "3.1.0" }')) === '["3.1.0"]', "the status: ok form is still read");
ok(/\(\?<!\[\\w\$\]\)version:/.test(src), "worker.js carries the word-boundary lookbehind");

console.log(`fm7-health-parity.test: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
