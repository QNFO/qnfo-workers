// DESIGN-SYSTEM-1 offline suite (owner directive 2026-11-09: "Don't give me shitty design anywhere").
// Proves: every text and control colour pair meets WCAG 2.2 AA in the light and the dark theme; buttons, choices and fields meet the
// 44 px tap size; the module can be inlined (no import, export or block comment, DS_/ds names only); every adopting worker holds exactly
// the current block in worker.js and its mirror; and each adopter's page, rendered offline, passes dsLint (design system present, body
// class, no text under 13 px, no button under the tap size, no raw hex colour in an inline style, at most one primary button).
// Run: node _shared/design-system.test.mjs
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { current, block, moduleSource } from "./inline-design-system.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 400) : "")); } };

const src = moduleSource();
ok(!/\/\*(?![^"]*")/.test(src.split("\n").filter((l) => !/^\s*"/.test(l) && !/^var DS_CSS|^\s*\]/.test(l)).join("\n")), "the module uses line comments only outside its CSS strings");
ok(!/^\s*(import|export)\b/m.test(src), "the module has no import or export, so it can be inlined");
ok(src.indexOf("`") < 0, "the module has no backtick, so a worker can hold it next to template-literal pages");
const names = [...src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
ok(names.length >= 8 && names.every((n) => /^(DS_|ds)/.test(n)), "every top-level name starts with DS_ or ds", names.filter((n) => !/^(DS_|ds)/.test(n)));
const DS = new Function(src + "\nreturn {" + names.join(",") + "};")();

// ---- contrast (WCAG 2.2: 4.5 for text, 3 for control borders and the focus ring)
ok(Math.abs(DS.dsContrast("#000000", "#ffffff") - 21) < 0.01, "dsContrast gives 21 for black on white");
ok(Math.abs(DS.dsContrast("#777777", "#ffffff") - 4.48) < 0.02, "dsContrast gives 4.48 for #777 on white");
for (const theme of ["light", "dark"]) {
  ok(Object.keys(DS.DS_TOKENS.light).every((k) => k in DS.DS_TOKENS[theme]), theme + " theme defines every token");
  for (const [fg, bg, min] of DS.DS_CONTRAST_PAIRS) {
    const r = DS.dsContrast(DS.DS_TOKENS[theme][fg], DS.DS_TOKENS[theme][bg]);
    ok(r >= min, theme + ": " + fg + " on " + bg + " is " + r.toFixed(2) + ", needs " + min);
  }
}

// ---- CSS: tap size, field size, focus, reduced motion, both themes
const css = DS.DS_CSS;
ok(/\.ds \.btn,\.ds button\.btn\{[^}]*min-height:44px/.test(css), "buttons are at least 44 px tall");
ok(/\.ds-choices button\{[^}]*min-height:56px/.test(css), "Yes / No / Not sure buttons are 56 px tall");
ok(/\.ds-seg button\{[^}]*min-height:44px/.test(css), "segmented buttons are 44 px tall");
ok(/\.ds input[^{]*\{[^}]*font:16px/.test(css), "fields use 16 px text so iOS does not zoom");
ok(/:focus-visible\{outline:3px/.test(css), "a visible focus ring");
ok(/prefers-reduced-motion/.test(css) && /prefers-color-scheme:dark/.test(css), "reduced motion and dark theme are handled");
ok(/grid-template-columns:repeat\(3,1fr\)/.test(css), "the three answers are equal width, so no answer is nudged");
ok(DS.dsLint(css).every((p) => !/under 13px|tap size/.test(p)), "the design system passes its own size checks", DS.dsLint(css));

// ---- dsLint catches the failures it names
const good = "<html><head>" + DS.dsHead("t") + "</head><body class=\"ds\"><button class=\"btn btn-primary\">Go</button></body></html>";
ok(DS.dsLint(good).length === 0, "a page built with dsHead and body.ds passes", DS.dsLint(good));
ok(DS.dsLint("<body><p style=\"font-size:11px\">x</p></body>").some((p) => /under 13px/.test(p)), "dsLint flags 11 px text");
ok(DS.dsLint("<body class=\"ds\"><style>button{min-height:30px}</style>DESIGN-SYSTEM-1 v").some((p) => /tap size/.test(p)), "dsLint flags a 30 px button");
ok(DS.dsLint("<body class=\"ds\"><a style=\"color:#fff\">x</a>DESIGN-SYSTEM-1 v").some((p) => /raw hex/.test(p)), "dsLint flags a raw hex inline colour");
ok(DS.dsLint("<body class=\"ds\">DESIGN-SYSTEM-1 v<button class=\"btn btn-primary\">a</button><button class=\"btn btn-primary\">b</button>").some((p) => /primary/.test(p)), "dsLint flags two primary buttons");
ok(DS.dsLint("<body>x</body>").some((p) => /DS_CSS/.test(p)), "dsLint flags a page without the design system");

// ---- adopters: current block in worker and mirror, and the rendered page passes dsLint
const root = new URL("../", import.meta.url);
// An empty D1: every query answers no rows, so a page renders its empty states offline.
function d1Stub() { const st = { bind() { return st; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { success: true }; } }; return { prepare() { return st; }, async batch() { return []; } }; }
const ADOPTERS = [
  { dir: "q08-prediction-markets", path: "/", env: () => ({}) },
  { dir: "qnfo-jobsearch", path: "/", env: () => ({}) },
  { dir: "qnfo-jobsearch", path: "/cv", env: () => ({}) },
  { dir: "qnfo-jobsearch", path: "/prep", env: () => ({}) },
  { dir: "personal-api", path: "/companion", env: () => ({}) },
  { dir: "personal-companion", path: "/", host: "reading.q08.org", env: () => ({ PERSONAL: d1Stub(), AUDIT: d1Stub() }) },
  { dir: "personal-companion", path: "/travel", host: "travel.q08.org", env: () => ({ PERSONAL: d1Stub(), AUDIT: d1Stub(), COMPANION_KEY: "k" }) },
  { dir: "q08-prediction-markets", path: "/whitepaper", env: () => ({}) },
  { dir: "q08-prediction-markets", path: "/forecasts", env: () => ({}) },
  { dir: "q08-prediction-markets", path: "/paper", env: () => ({}) },
  { dir: "q08-prediction-markets", path: "/track-record", env: () => ({}) },
  { dir: "qnfo-fleet-dashboard", path: "/", env: () => ({}) },
  { dir: "qnfo-fleet-dashboard", path: "/focus", env: () => ({ AUDIT: d1Stub() }) },
  { dir: "qnfo-fleet-dashboard", path: "/touch", env: () => ({ AUDIT: d1Stub() }) }
];
for (const a of ADOPTERS) {
  for (const f of ["worker.js", "deployed-current.worker.js"]) {
    const text = readFileSync(new URL(a.dir + "/" + f, root), "utf8");
    ok(current(text) === block(), a.dir + "/" + f + " holds the current DESIGN-SYSTEM-1 block (run node _shared/inline-design-system.mjs " + a.dir + ")");
  }
  // personal-companion imports cloudflare:workers and sibling modules: load it through its own harness with the import stubbed.
  const mod = a.dir === "personal-companion"
    ? (await (await import(pathToFileURL(fileURLToPath(new URL("personal-companion/_harness-import-worker.mjs", root))).href)).importWorker(() => readFileSync(new URL("personal-companion/worker.js", root), "utf8").replace('import { WorkflowEntrypoint } from "cloudflare:workers";', "var WorkflowEntrypoint = class {};") + "\n//" + Math.random(), new URL("personal-companion/", root))).default
    : (await import(pathToFileURL(fileURLToPath(new URL(a.dir + "/worker.js", root))).href)).default;
  let html = "";
  try { const r = await mod.fetch(new Request("https://" + (a.host || "test.invalid") + a.path), a.env(), { waitUntil() {}, passThroughOnException() {} }); html = await r.text(); }
  catch (e) { ok(false, a.dir + a.path + " renders offline", e.message); continue; }
  const problems = DS.dsLint(html);
  ok(problems.length === 0, a.dir + a.path + " passes dsLint", problems);
}

console.log("design-system: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
