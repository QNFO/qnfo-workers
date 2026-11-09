// CROSS-LINK-FOLLOWUP-3 (agent_issues 1001712): the page shell renders the QNFO family bar and the Keep exploring module on the server.
// Output MUST contain "0 failed" on success.   node q08-signal-engine/official-lane.test.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

ok(/var Q08_FAMILY_BAR = '<div class="q-family">/.test(src) && /The QNFO family<\/span><a href="https:\/\/qnfo\.org\/">QNFO<\/a><a href="https:\/\/qwav\.org\/">QWAV<\/a>/.test(src), "the family bar names QNFO and QWAV");
ok(/data-q-keep="q08"/.test(src) && /class="q-explore"/.test(src), "the Keep exploring module carries data-q-keep for hydration");
ok(/<a class="q-skip" href="#main">Skip to main content<\/a>' \+ Q08_FAMILY_BAR \+ '<header class="q-top">/.test(src), "the bar sits before the header");
ok(/Q08_EXPLORE \+ '<footer class="q-foot">/.test(src), "the module sits before the footer");
ok(src.indexOf("The QNFO family: <a href=\"https://qnfo.org/\">QNFO</a>") > 0, "the footer carries the family line");
ok(src.indexOf("ANALYSIS-FORM-1:BEGIN") > 0 && /AF_OBJECTION_RULE\.replace/.test(src), "domainForm carries the shared analysis-form rules (EK-6-ADOPT-1)");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
