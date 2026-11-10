import { readFileSync } from "node:fs";
import assert from "node:assert";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const a = src.indexOf("function fundingSlug"), b = src.indexOf('__name(jobFundingDraft');
assert(a > 0 && b > a, "FUNDING-DRAFT-1 present");
const calls = { put: [], sql: [] };
const mk = new Function("__name", "ghGet", "ghPut", "ghB64Text", "ghTextB64", "recordEvent", "rndB36", "AI_MODEL",
  src.slice(a, b) + "; return { fundingSlug, fundingDraftDoc, fundingDraftPrompt, jobFundingDraft };");
const big = "x".repeat(500);
const env = {
  AI: { run: async () => ({ response: big }) },
  AUDIT: { prepare: (q) => ({ bind: (...v) => ({ run: async () => { calls.sql.push([q, v]); return {}; } }),
    first: async () => null, all: async () => ({ results: /state = 'fetched'/.test(q) ? [{ id: 7, funder: "Acme Fund / 2026", url: "https://x.test", evidence: "HTTP 200" }] : [] }) }) }
};
const m = mk(() => {}, async (e, p) => p.includes("NLNET") ? { status: 200, body: { content: "tpl" } } : { status: 404, body: {} },
  async (e, p, body) => { calls.put.push([p, body]); return { status: 201, body: {} }; }, () => "template text", (t) => t, async () => {}, () => "abcd", "m");
assert.equal(m.fundingSlug("Acme Fund / 2026"), "acme-fund-2026");
assert(m.fundingDraftDoc({ funder: "F", evidence: "e" }, "body", "2026-11-10").includes("AI disclosure"));
assert(m.fundingDraftPrompt({ funder: "F" }, "tpl", {}).includes("TO-FILL"));
const r = await m.jobFundingDraft(env, { force: true });
assert.equal(r.status, "ok");
assert.equal(r.drafted[0].state, "draft");
assert.equal(calls.put[0][0], "/repos/QNFO/qnfo-workers/contents/funding/drafts/acme-fund-2026.md");
assert(calls.sql.some(([q]) => /SET state = 'draft'/.test(q)), "state set to draft");
console.log("ok funding-draft");
