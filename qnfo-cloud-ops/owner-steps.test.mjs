// OWNER-STEPS-WATCH-1 (qnfo-cloud-ops 1.21.0) offline suite. No network: fetch and D1 are stubbed.
// Proves: a card is resolved, with evidence, only when its public result exists (QNFO/license carries v2.1 with
// section 12; both libraries are on PyPI and have Zenodo software records); a partial result leaves the card open;
// a card that is not open is never touched; the job rides the daily release-check slot.
// Run: node qnfo-cloud-ops/owner-steps.test.mjs
import { readFileSync } from "node:fs";

const IMPORT = 'import { connect } from "cloudflare:sockets";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.includes(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const patched = src.replace(IMPORT, "var connect = function () { throw new Error('sockets are stubbed in this test'); };") +
  "\nexport { OWNER_STEP_PROBES as __P, ownerStepVerdict as __v, jobOwnerStepsWatch as __job, CRON_COMPANIONS as __comp, JOBS as __jobs };\n";
const mod = await import("data:text/javascript;base64," + Buffer.from(patched).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const [ULA, REL] = mod.__P;
const ULA21 = "# QNFO Unified License Agreement (QNFO-ULA) — Version 2.1\n\n## 12. Software Terms\n" + "x".repeat(3000);
const hits = (n) => JSON.stringify({ hits: { total: n, hits: [] } });

ok(mod.__comp["release-check"].includes("owner-steps-watch") && typeof mod.__jobs["owner-steps-watch"] === "function", "rides the release-check slot and is a dispatchable job");
ok(mod.__v(ULA, [{ status: 200, text: ULA21 }]).done === true, "ULA card done when v2.1 with section 12 is on QNFO/license");
ok(mod.__v(ULA, [{ status: 404, text: "404: Not Found" }]).done === false, "ULA card open while not posted");
ok(mod.__v(ULA, [{ status: 200, text: "# QNFO-ULA — Version 2.1 draft without the section" }]).done === false, "a v2.1 file without section 12 does not count");
ok(mod.__v(REL, [{ status: 200 }, { status: 200 }, { status: 200, text: hits(1) }, { status: 200, text: hits(2) }]).done === true, "release card done when both PyPI projects and both Zenodo software records exist");
ok(mod.__v(REL, [{ status: 200 }, { status: 404 }, { status: 200, text: hits(1) }, { status: 200, text: hits(1) }]).done === false, "one missing PyPI project keeps it open");
ok(mod.__v(REL, [{ status: 200 }, { status: 200 }, { status: 200, text: hits(0) }, { status: 200, text: hits(1) }]).done === false, "a missing Zenodo record keeps it open");
ok(mod.__v(REL, [{ status: 200 }, { status: 200 }, { status: 200, text: "not json" }, { status: 200, text: hits(1) }]).done === false, "unreadable Zenodo answer keeps it open");

// The job: resolves only open cards, only on evidence.
const cards = { "ula-v2-1-post": "open", "code-release-pypi-zenodo": "resolved" };
const updates = [];
const env = { AUDIT: { prepare: (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; }, async first() { return cards[st.a[0]] ? { status: cards[st.a[0]] } : null; }, async run() { if (/UPDATE human_actions/.test(sql)) { updates.push(st.a); cards[st.a[0]] = "resolved"; } return {}; } }; return st; } } };
let posted = false; const fetched = [];
globalThis.fetch = async (u) => { fetched.push(String(u)); return /QNFO-ULA-v2\.1\.md/.test(String(u)) ? (posted ? new Response(ULA21, { status: 200 }) : new Response("404", { status: 404 })) : new Response("{}", { status: 404 }); };
let r = await mod.__job(env);
ok(updates.length === 0 && r.status === "ok", "nothing resolved before the step is done", r);
ok(!fetched.some((u) => /pypi|zenodo/.test(u)), "a card that is not open is not probed", fetched);
posted = true;
r = await mod.__job(env);
ok(updates.length === 1 && updates[0][0] === "ula-v2-1-post" && /section 12 present/.test(updates[0][1]), "ULA card resolved with evidence once posted", updates);
r = await mod.__job(env);
ok(updates.length === 1, "an already resolved card is not touched again");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
