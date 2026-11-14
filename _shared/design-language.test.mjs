// DESIGN-LANGUAGE-1 offline suite: every product theme of the Quniverse passes the portfolio's contrast pairs in both themes,
// varies only the accent, stays inside the portfolio hue range, and its generated css is current. Run: node _shared/design-language.test.mjs
import { readFileSync } from "node:fs";
import { DS, deriveAccent, prove, css, hueDistance } from "./design-language.mjs";

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 300) : "")); } };
const L = JSON.parse(readFileSync(new URL("design-language.json", import.meta.url), "utf8"));

ok(L.portfolio.seed.toLowerCase() === "#1d4ed8" && DS.DS_TOKENS.light.accent.toLowerCase() === L.portfolio.seed.toLowerCase(), "the portfolio seed is the design system's own accent");
for (const [id, p] of Object.entries(L.products)) {
  const bad = prove(deriveAccent(p.accent_seed));
  ok(bad.length === 0, id + ": every contrast pair passes in both themes", bad);
  ok(hueDistance(p.accent_seed, L.portfolio.seed) <= L.portfolio.hue_range_deg, id + ": accent hue is inside the portfolio range", hueDistance(p.accent_seed, L.portfolio.seed));
  ok(Object.keys(p).every((k) => ["plane", "role", "accent_seed", "adopted_by"].includes(k)), id + ": varies only what a product may vary");
  ok(L.css[id] === css(p.accent_seed), id + ": the generated css is current (run node _shared/design-language.mjs --write)");
  ok(DS.dsLint("<meta name=\"viewport\" content=\"width=device-width\"><body class=\"ds\">DESIGN-SYSTEM-1 v<style>" + L.css[id] + "</style></body>").length === 0, id + ": the override passes dsLint");
}
// Any seed yields a passing theme: a tenant or a product never needs a hand-tuned colour.
let seedBad = 0; for (let i = 0; i < 300; i++) { const s = "#" + ((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, "0"); if (prove(deriveAccent(s)).length) seedBad++; }
ok(seedBad === 0, "300 arbitrary seeds all derive passing themes", seedBad);
// Adoption debt only shrinks: a product that is adopted leaves the pending list.
for (const id of L.pending_adoption_shrink_only) ok(L.products[id] && L.products[id].adopted_by.length === 0, id + " is pending adoption and has no adopter yet (move it off the list when a worker adopts it)");
for (const [id, p] of Object.entries(L.products)) if (p.adopted_by.length) ok(!L.pending_adoption_shrink_only.includes(id), id + " has an adopter so it is not pending");
console.log("design-language: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
