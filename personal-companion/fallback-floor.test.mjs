// personal-companion 1.13.2 COMPANION-FALLBACK-FLOOR-1 suite (charter pillar: core).
// Failure mode proven: 2026-10-07/08, 40+ gpt-oss-120b drafts landed at 1100-1750 words against a 1700-2000 floor; nothing
// published for 78h. A Workers AI draft is held to 70% of the floor; a DeepSeek draft keeps the full floor.
// Run: node personal-companion/fallback-floor.test.mjs
import { readFileSync } from "node:fs";
const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const { callModel, validatePiece, expandFeedback } = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};") + "\n//" + Math.random()).toString("base64"));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const body = (n, h) => Array.from({ length: h }, (_, i) => "## Item " + (i + 1) + "\n" + ("word ".repeat(Math.floor(n / h)))).join("\n");
const hasLen = (r) => r.problems.some((p) => /length/.test(p));
const essay = (n) => ({ title: "T", body_md: body(n, 4) });
const lenProblems = (n, form) => validatePiece({ title: "T", body_md: body(n, 4) }, form).problems.filter((p) => /length/.test(p));
const msgs = [{ role: "user", content: "hi" }];
const PROSE = "x".repeat(400);
// DeepSeek healthy: full floor
globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: PROSE } }] }), { status: 200 });
await callModel({ DEEPSEEK_API_KEY: "k", AI: { run: async () => ({ response: PROSE }) } }, msgs, 4000, 1000, "deepseek-chat", "writer");
ok(lenProblems(1500, "essay").length === 1, "DeepSeek: 1500-word essay below 2000 floor is rejected");
ok(lenProblems(1200, "notes").length === 1, "DeepSeek: 1200-word notes below 1700 is rejected");
// Fallback: 70% floor (essay 1400, serial 1260, notes 1190)
globalThis.fetch = async () => new Response("{}", { status: 402 });
await callModel({ DEEPSEEK_API_KEY: "k", AI: { run: async () => ({ response: PROSE }) } }, msgs, 4000, 1000, "deepseek-chat", "writer");
ok(lenProblems(1500, "essay").length === 0, "fallback: 1500-word essay passes (floor 1400)");
ok(lenProblems(1300, "essay").length === 1, "fallback: 1300-word essay still rejected");
ok(lenProblems(1250, "notes").length === 0, "fallback: 1250-word notes passes (floor 1190)");
ok(lenProblems(1100, "notes").length === 1, "fallback: 1100-word notes still rejected");
ok(lenProblems(3300, "essay").length === 1, "fallback: ceiling 3200 unchanged");
const sh = expandFeedback(["essay length 1300"], "essay", { title: "T", body_md: "b" });
ok(sh && /1400/.test(sh), "fallback: expand prompt cites the relaxed floor, got " + String(sh).slice(0, 80));
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
