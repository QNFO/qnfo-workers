// SOURCE-VOICE-SOCIAL-1 (qnfo-social 0.13.1, agent_issues 2472): POST /compose stores the abstract with the draft, so the
// repair and recheck passes (which skip a row without one) can work on it. Source-level check of the insert and of the two
// readers' filters. Run: node qnfo-social/compose-abstract.test.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("if (p === '/compose' && m === 'POST') {"), b = src.indexOf("if (p === '/approve'", a);
const compose = src.slice(a, b);
assert.match(compose, /INSERT INTO social_threads \(slug, title, doi, abstract, posts, status, notes\) VALUES \(\?,\?,\?,\?,\?,\?,\?\)"\)\.bind\(slug, title, doi, abstract,/);
assert.match(src, /FROM social_threads WHERE status='draft' AND abstract IS NOT NULL AND abstract <> ''/, "the repair pass reads drafts that carry an abstract");
assert.match(src, /var abstract = String\(row\.abstract \|\| ""\)\.slice\(0, 4000\);\n\s*if \(!abstract\) \{ skipped\+\+; continue; \}/, "the recheck skips a row without one");
console.log("compose-abstract test passed");

// LEDE-SOCIAL-1: post 1 says what the paper is before any hook.
const mod = await import("data:text/javascript;base64," + Buffer.from(src + "\nexport { threadLedeIssues as __lede };\n").toString("base64"));
const T = "Thermodynamic Trade-off Frontiers for Neuromorphic Processors";
assert.equal(mod.__lede(T, ["What if your chip could think for free?", "x"]).length, 1, "a teaser with no subject is held");
assert.equal(mod.__lede(T, ["Neuromorphic processors trade energy for accuracy along a frontier, in a paper by the author.", "x"]).length, 0, "a lede in the title's words passes");
assert.equal(mod.__lede(T, ["A paper by Rowan Brad Quni-Gudzinas finds a frontier.", "x"]).length, 0, "naming the author passes");
assert.match(src, /"1\. Post 1: the lede, for a reader who has never heard of the work/, "the compose prompt asks for a lede");
console.log("lede tests passed");
