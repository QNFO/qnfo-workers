// OWNER-NO-INTERNAL-AI-DISCLOSURE-1: twin replies carry no AI disclosure prefix (internal tool).
// Run: node personal-api/ai-api-disclosure.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const withExports = source + "\nexport { discloseTwinAi as __discloseTwinAi, TWIN_AI_DISCLOSURE as __TWIN_AI_DISCLOSURE };\n";
const worker = await import("data:text/javascript;base64," + Buffer.from(withExports).toString("base64"));
const { __discloseTwinAi: disclose, __TWIN_AI_DISCLOSURE: disclosure } = worker;

assert.equal(disclose("Hello."), "Hello."); assert.equal(disclosure, ""); assert.equal(disclose(""), "");
assert.equal((source.match(/discloseTwinAi\(CMP\.chatFollowUp\(companionContext,/g) || []).length, 3);

console.log("4 passed, 0 failed");
