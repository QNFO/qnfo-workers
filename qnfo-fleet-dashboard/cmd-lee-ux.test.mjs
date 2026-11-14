// CMD-LEE-UX-1 (owner 2026-11-14, Cloudflare Agent Lee as the model for the fleet command line): a table in an answer gets a "View table" button that opens a sortable
// full-screen view, and the follow-up bullets an answer ends with ("Would you like me to:") become tap chips that send the line as the next command.
// Proves: the page script still parses, defines decorate/view/follow, wires them into the plain and streamed answer paths, and the css styles the overlay and chips.
// Run: node --no-warnings qnfo-fleet-dashboard/cmd-lee-ux.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const line = src.split("\n").find((l) => l.startsWith("var CMD_JS = "));
ok(!!line, "CMD_JS present");
const lit = line.slice("var CMD_JS = ".length).replace(/\s*\/\/ standards-ok.*$/, "").replace(/;\s*$/, "").replace(/" \+ "HOLDER" \+ "/, "false");
let js = "";
try { js = vm.runInNewContext(lit); } catch (e) { ok(false, "CMD_JS literal evaluates: " + e.message); }
try { new vm.Script(js); ok(true, ""); } catch (e) { ok(false, "page script parses: " + e.message); }
for (const f of ["function decorate(", "function view(", "function follow("]) ok(js.includes(f), f + " defined");
ok(js.includes("decorate(mm);c.appendChild(mm)"), "plain answers decorate tables");
ok(js.includes("decorate(m2);txt.appendChild(m2)"), "streamed answers decorate tables");
ok((js.match(/follow\(c,/g) || []).length >= 3, "follow chips on plain and streamed answers");
ok(src.includes(".ovp th{cursor:pointer") && src.includes(".fu{display:flex"), "css for overlay and chips");
ok(/min-height:44px/.test(src.slice(src.indexOf(".ovp button"), src.indexOf(".ovp button") + 120)), "overlay buttons keep the 44 px tap size");
console.log(`cmd-lee-ux: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
