// PAPER-AUDIENCE-CATEGORIES-1 (owner directive 2026-10-18, pillar reach). The library used to file every paper
// into five keyword buckets, and "Other" held 161 of 606 public papers (26% of the site). This suite locks the
// replacement: nine audience shelves, no "Other" anywhere, a curated D1 shelf that wins over the fallback
// classifier, and aliases so the retired ?category= slugs still land somewhere useful.
// Run: node qnfo-gateway/categories.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "gwc-"));
writeFileSync(join(dir, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8") +
  "\nexport { CATEGORY_TAXONOMY, CATEGORY_LABELS, CATEGORY_AUDIENCE, CATEGORY_BLURB, CATEGORY_ALIAS, categoryKey, detectCategory, paperShelf, lpPaperRow, LP_CAT_ORDER, LP_CAT_VAR };\n");
const W = await import(pathToFileURL(join(dir, "w.mjs")).href);

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };

const KEYS = ["energy", "qec", "physics", "mathematics", "logic", "ai-epistemics", "ai-operations", "assessment", "synthesis"];

// 1. the taxonomy itself
ok(Array.isArray(W.CATEGORY_TAXONOMY) && W.CATEGORY_TAXONOMY.length === 9, "nine shelves", W.CATEGORY_TAXONOMY.length);
ok(W.CATEGORY_TAXONOMY.map(c => c.k).join() === KEYS.join(), "shelf keys and order are the agreed nine", W.CATEGORY_TAXONOMY.map(c => c.k));
ok(new Set(W.CATEGORY_TAXONOMY.map(c => c.k)).size === 9, "shelf keys are unique");
ok(!W.CATEGORY_TAXONOMY.some(c => /other/i.test(c.k) || /^other$/i.test(c.label)), "no shelf is called Other");
ok(!Object.values(W.CATEGORY_LABELS).some(l => /^other$/i.test(l)), "no label reads Other", W.CATEGORY_LABELS);
ok(W.LP_CAT_ORDER.join() === KEYS.join(), "LP_CAT_ORDER is derived from the taxonomy");
for (const c of W.CATEGORY_TAXONOMY) {
  ok(!!c.label && !!c.audience && !!c.blurb, "shelf " + c.k + " names a reader and says what it holds");
  ok(/^--[a-z]+$/.test(c.color), "shelf " + c.k + " has a colour token", c.color);
  ok(!!W.LP_CAT_VAR[c.k], "colour is registered for " + c.k);
}
ok(new Set(W.CATEGORY_TAXONOMY.map(c => c.color)).size === 9, "all nine shelves have distinct colours");

// 2. the fallback classifier never returns "other" and reads the paper, not just the words
const CLASSIFIED = [
  ["Helical Electron Structure at the Compton Scale: Geometric Origin of the Fine-Structure Constant", "", "physics"],
  ["Two-Level System Defects as a Random Ensemble: Counting and Dephasing Estimates for Superconducting Qubits", "", "physics"],
  ["Scaling of the Hadamard Deformation Space in Concatenated [[4,1,2]] Iceberg Codes", "", "qec"],
  ["Ultrametric Quantum Error Correction on Bruhat–Tits Trees", "", "qec"],
  ["Time as Bruhat-Tits Tree Depth: Discrete p-Adic Temporal Ordering", "", "mathematics"],
  ["Numeral Systems as Evolving Cognitive Technologies: Error Propagation and Positional Notation", "", "mathematics"],
  ["The Void Is Not False: Recovering the Unmarked State in the Calculus of Indications", "", "logic"],
  ["What a Fairness Audit Must Report When Demographic Labels Are Missing", "", "ai-epistemics"],
  ["Lifetime as a Placement Signal: Endurance Budgets for KV Cache Tiering in Agentic LLM Serving", "", "ai-operations"],
  ["Due Diligence Report: QuiX Quantum", "", "assessment"],
  ["Thermodynamic Budgeting for Hybrid Quantum-Classical Computing: A Three-Layer Energy Model", "", "energy"]
];
for (const [title, abs, want] of CLASSIFIED) {
  const got = W.detectCategory(title, abs);
  ok(got === want, "classifier: " + title.slice(0, 52) + " -> " + want, got);
}
ok(KEYS.includes(W.detectCategory("An untitled fragment", "")), "the classifier always returns a shelf", W.detectCategory("An untitled fragment", ""));
ok(W.detectCategory("An untitled fragment", "") === "synthesis", "an unsignalled essay falls to the cross-cutting shelf");

// 3. the curated D1 shelf wins over the classifier
ok(W.paperShelf({ category: "energy", title: "Quantum error correction", abstract: "" }) === "energy", "a curated shelf beats the keyword guess");
ok(W.paperShelf({ category: "qec", title: "Something with no signal", abstract: "" }) === "qec", "curated shelf used as given");
ok(W.paperShelf({ title: "Ultrametric Quantum Error Correction on Bruhat–Tits Trees", abstract: "" }) === "qec", "an unfiled paper falls back to the classifier");
ok(W.paperShelf({ category: "", title: "Two-Level System Defects and Superconducting Qubits", abstract: "" }) === "physics", "an empty shelf falls back to the classifier");

// 4. retired query slugs are aliased, unknown values are ignored
ok(W.categoryKey("other") === "synthesis", "?category=other lands on the cross-cutting shelf");
ok(W.categoryKey("number-theory") === "mathematics", "?category=number-theory lands on numbers and p-adics");
ok(W.categoryKey("computer-science") === "logic", "?category=computer-science lands on logic and formalism");
ok(W.categoryKey("physics") === "physics" && W.categoryKey("energy") === "energy", "current slugs pass through");
ok(W.categoryKey("all") === "" && W.categoryKey("") === "" && W.categoryKey(null) === "", "all and empty mean the whole library");
ok(W.categoryKey("not-a-shelf") === "", "an unknown slug filters nothing rather than inventing a shelf");
ok(W.categoryKey("ENERGY") === "energy", "the slug is case-insensitive");

// 5. a rendered row shows its shelf, its colour and never the word Other
const row = W.lpPaperRow({ slug: "x", title: "Two-Level System Defects as a Random Ensemble", abstract: "superconducting qubits", created_at: "2026-10-01", version: "1.0.0", category: "qec" });
ok(row.includes('data-cat="qec"'), "row carries the curated shelf", row.slice(0, 160));
ok(row.includes(W.CATEGORY_LABELS.qec), "row prints the shelf label");
ok(row.includes("var(--teal)"), "row uses the shelf colour");
ok(!/>Other</.test(row), "row never prints Other");
const unshelved = W.lpPaperRow({ slug: "y", title: "A treatise on everything", abstract: "", created_at: "2026-10-01" });
ok(unshelved.includes(W.CATEGORY_LABELS.synthesis) && !/>Other</.test(unshelved), "an unshelved essay prints the cross-cutting label, not Other");

console.log(`\nPAPER-AUDIENCE-CATEGORIES-1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
