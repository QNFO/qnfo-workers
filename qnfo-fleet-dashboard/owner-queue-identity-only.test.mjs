// OWNER-QUEUE-IDENTITY-ONLY-1 offline suite (qnfo-fleet-dashboard 1.68.0). Owner 2026-10-26: "Why do so many things need me? I'm not doing any of them."
// Proves: humanView moves code-loop and issue-loop items out of h.items (so out of the count, the banner and the area queues) into
// fleet_handling; every other source stays an owner item; the page lists them under "The fleet is handling"; the realtime digest carries the count.
// Run: node qnfo-fleet-dashboard/owner-queue-identity-only.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

const decl = /var FLEET_HANDLED_SOURCES = (\[[^\]]*\]);/.exec(src);
ok(decl && JSON.stringify(eval(decl[1])) === JSON.stringify(["code-loop", "issue-loop"]), "fleet-handled sources are the code loop and the issue loop", decl && decl[1]);
const hv = src.slice(src.indexOf("async function humanView("));
const a = hv.indexOf("// OWNER-QUEUE-IDENTITY-ONLY-1 (owner"), b = hv.indexOf("let gov = null;", a);
ok(a > 0 && b > a, "the filter block is in humanView before the count is taken");
ok(hv.indexOf("const items = h.items.filter(") > b && hv.indexOf("if (items.length) verdict = \"ACTION\"") > b, "the banner count reads h.items after the filter");
const sb = { h: { items: [
  { key: "code:ct_1", source: "code-loop", title: "Code task parked: a", why: "w", age: 1 },
  { key: "disp:f1", source: "issue-loop", title: "Fleet issue", why: "w", age: 2 },
  { key: "ha:1", source: "human_actions", title: "IDENTITY-BOUND: sign the contract" },
  { key: "mail:x", source: "inbox", title: "Reply to a person" },
] }, FLEET_HANDLED_SOURCES: eval(decl[1]), out: null };
vm.createContext(sb);
vm.runInContext(hv.slice(a, b) + "\nout = { owner: h.items.map(function(i){ return i.key; }), fleet: fleetHandling.map(function(i){ return i.key; }) };", sb);
ok(JSON.stringify(sb.out.owner) === JSON.stringify(["ha:1", "mail:x"]), "only non-fleet items stay owner items", sb.out);
ok(JSON.stringify(sb.out.fleet) === JSON.stringify(["code:ct_1", "disp:f1"]), "parked code tasks and issue-loop items go to fleet_handling", sb.out);
ok(/fleet_handling: \{ count: fleetHandling\.length, items: fleetHandling\.map\(/.test(hv), "humanView returns fleet_handling with a count and the items");
ok(/fleet_handling: v\.fleet_handling \? v\.fleet_handling\.count : 0/.test(src), "the realtime digest changes when the fleet-handled count changes");
ok(src.indexOf('id="fleet-handling"><summary>The fleet is handling') > 0 && /none of these needs you/.test(src), "the page lists fleet work apart and says it needs no one");
const m = /^var VERSION = "(\d+)\.(\d+)\.(\d+)/m.exec(src);
ok(m && (+m[1] > 1 || +m[2] >= 68), "VERSION is at least 1.68.0", m && m[0]);
console.log("owner-queue-identity-only: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
