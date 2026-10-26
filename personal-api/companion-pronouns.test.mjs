// personal-api/companion-pronouns.test.mjs (COMPANION-NEUTRAL-PRONOUNS-1, rule 28)
// The owner has not stated pronouns: no string literal the model reads in companion.js may call them he, his, him or himself.
// Run: node personal-api/companion-pronouns.test.mjs
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
};
const src = fs.readFileSync(new URL("./companion.js", import.meta.url), "utf8");
const code = src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const lits = code.match(/"(?:[^"\\\n]|\\.)*"/g) || [];
const gendered = lits.filter((l) => !/never he or she/.test(l) && /\b(he|his|him|himself|she|her|hers|herself)\b/i.test(l));
ok("no gendered pronoun in a string literal", gendered.length === 0, gendered.slice(0, 5));
ok("COMPANION MODE asks for the name or you", /never he or she/.test(src));
const w = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
ok("worker.js carries the inlined prompt", /never he or she/.test(w) && !/active partner in his days/.test(w));
console.log("\n" + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
