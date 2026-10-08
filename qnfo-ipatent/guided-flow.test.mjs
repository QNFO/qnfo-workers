// GUIDED-FLOW-1 offline suite (IPATENT-UI-OVERHAUL-1 step 1, agent_issues 2049). The ?v=2 variant carries the guided flow
// (describe, mechanism, draft, support map, fix gaps, file with the 12-month date); the default page keeps every flow
// element hidden and its script runs; the 12-month deadline follows 35 U.S.C. 119(e) with the 21(b) weekend roll; the
// calendar file is valid; v=2 page views and drafts are counted apart so both variants can be measured.
// Run: node qnfo-ipatent/guided-flow.test.mjs   (prints "N passed, 0 failed")
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const mod = await import("./worker.js");
const W = mod.default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

// 1. ipDeadline / ipDeadlineIcs, evaluated from the source block.
const block = src.slice(src.indexOf("// ---- GUIDED-FLOW-1:BEGIN"), src.indexOf("// ---- GUIDED-FLOW-1:END"));
const sb = { __name: (f) => f }; vm.createContext(sb);
vm.runInContext(block + "\n__x = { ipDeadline, ipDeadlineIcs, FLOW_STEPS, FLOW_PAGE_JS };", sb);
const { ipDeadline, ipDeadlineIcs, FLOW_STEPS, FLOW_PAGE_JS } = sb.__x;
let d = ipDeadline("2026-10-08");
ok(d && d.due === "2027-10-08" && !d.rolled && d.weekday === "Friday", "a weekday date is the same date next year", d);
d = ipDeadline("2026-10-09");
ok(d && d.due === "2027-10-11" && d.rolled && d.weekday === "Monday", "a Saturday anniversary rolls to Monday", d);
d = ipDeadline("2026-10-10");
ok(d && d.due === "2027-10-11" && d.rolled, "a Sunday anniversary rolls to Monday", d);
d = ipDeadline("2028-02-29");
ok(d && d.due === "2029-02-28", "29 February maps to 28 February", d);
ok(ipDeadline("") === null && ipDeadline("2026-13-01") === null && ipDeadline("next week") === null, "bad dates give null");
const ics = ipDeadlineIcs("2027-10-08", "Drawer hinge, folding;\nv2");
ok(/^BEGIN:VCALENDAR\r\n/.test(ics) && /DTSTART;VALUE=DATE:20271008\r\n/.test(ics) && (ics.match(/BEGIN:VALARM/g) || []).length === 2 && /END:VCALENDAR$/.test(ics), "the calendar file is a VCALENDAR with the date and two reminders");
ok(!/hinge, folding;/.test(ics) && !/\nv2/.test(ics.replace(/\r\n/g, "")), "commas, semicolons and newlines in the title cannot break the file");
ok(FLOW_STEPS.map((x) => x[0]).join(",") === "describe,mechanism,draft,map,fix,file", "six steps in order");
ok(/var ipDeadline = function ipDeadline/.test(FLOW_PAGE_JS), "the page runs the same deadline function");

// 2. Pages.
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const views = [];
const envFor = () => ({ IPATENT_DB: { prepare(sql) { const s = stmt(); const b = s.bind; s.bind = (...a) => { if (/INSERT INTO page_views/.test(sql)) views.push(a[0]); if (/INSERT INTO usage_counts/.test(sql)) views.push("usage:" + a[0]); return s; }; return s; } } });
const waits = [];
const ctx = { waitUntil(p) { waits.push(p); } };
const UA = "Mozilla/5.0 (Macintosh) Safari/605";
const get = async (u) => { const r = await W.fetch(new Request(u, { headers: { "User-Agent": UA } }), envFor(), ctx); await Promise.all(waits.splice(0)); return { status: r.status, h: await r.text() }; };
const p1 = await get("https://ipatent.qnfo.org/");
const p2 = await get("https://ipatent.qnfo.org/?v=2");
ok(p1.status === 200 && p2.status === 200, "both variants answer 200");
ok(p1.h === p2.h, "one HTML for both variants: the flag is read in the page, so the default page cannot drift");
ok(/<nav class="flow" id="flowRail" style="display:none"/.test(p1.h), "the step rail is hidden unless v=2");
for (const id of ["smHero", "fixZone", "fileZone"]) ok(new RegExp('id="' + id + '" style="display:none"').test(p1.h), id + " is hidden on the default page");
for (const st of FLOW_STEPS) ok(p1.h.includes('id="flow-' + st[0] + '"') && p1.h.includes('href="#flow-' + st[0] + '"'), "step " + st[0] + " has its anchor");
ok(/12 months/.test(p1.h) && /35 U\.S\.C\. 21\(b\)/.test(p1.h) && /Not legal advice/.test(p1.h), "the filing step names the 12-month rule, the weekend roll and the not-legal-advice line");
const scripts = [...p1.h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let parsed = 0; for (const sc of scripts) { try { new Function(sc); parsed++; } catch (e) { console.error(e.message); } }
ok(scripts.length > 0 && parsed === scripts.length, "every inline script parses");
ok(views.includes("/") && views.includes("/?v=2"), "page views are counted per variant", views);

// 3. Drafts: a v2 draft is also counted as draft-v2.
views.length = 0;
const env = envFor();
env.AI = { run: async (m, o) => (o && o.messages ? { response: "## 1. TITLE OF INVENTION\nHinge\n## 5. DETAILED DESCRIPTION\nA hinge comprising a pin.\n## 6. CLAIMS\n1. A hinge comprising a pin.\n## 9. SUPPORT GAPS\n- none" } : { data: [[0.1]] }) };
const post = async (body) => { const r = await W.fetch(new Request("https://ipatent.qnfo.org/api/draft", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify(body) }), env, ctx); await Promise.all(waits.splice(0)); return r.status; };
const desc = "A drawer hinge with a torsion spring around a stainless pivot pin so the front folds flat against the cabinet side.";
ok(await post({ title: "Hinge", description: desc, variant: "v2" }) === 200, "a v2 draft succeeds");
ok(views.includes("usage:draft") && views.includes("usage:draft-v2"), "a v2 draft counts as draft and draft-v2", views);
views.length = 0;
ok(await post({ title: "Hinge", description: desc }) === 200 && views.includes("usage:draft") && !views.includes("usage:draft-v2"), "a default draft counts only as draft", views);

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
