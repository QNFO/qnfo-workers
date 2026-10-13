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
