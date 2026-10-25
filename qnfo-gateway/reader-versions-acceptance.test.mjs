import assert from "node:assert/strict";
import worker from "./worker.js";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("US10 fixtures must not access a network"); };
const papers = {
  "synthetic-alpha": { title: "Synthetic alpha", body_md: "The alpha fixture reports 42 samples at https://example.test/alpha.", abstract: "" },
  "synthetic-beta": { title: "Synthetic beta", body_md: "The beta fixture reports 17 samples at https://example.test/beta.", abstract: "" }
};
let modelCalls = 0;
let captured;
let output;
const sqlCalls = [];
const binding = {
  prepare(sql) {
    sqlCalls.push(sql);
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return /FROM papers/.test(sql) ? papers[args[0]] || null : { n: 1 }; },
      async all() { return { results: [] }; },
      async run() { return { success: true }; }
    };
    return statement;
  }
};
const env = {
  LIVING_PAPER: binding, DB: binding, QNFO_BUCKET: { async get() { return null; } },
  AI: { async run(model, input) { modelCalls++; captured = input.messages; return { response: output }; } }
};
const ask = async (slug) => {
  const response = await worker.fetch(new Request("https://papers.example.test/api/ask", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, question: "Which samples and source are reported?" })
  }), env, { waitUntil() {} });
  return { status: response.status, data: await response.json() };
};
try {
  output = "The alpha fixture reports 42 samples at https://example.test/alpha.";
  let result = await ask("synthetic-alpha");
  assert.equal(result.status, 200);
  assert.equal(result.data.slug, "synthetic-alpha");
  assert.equal(result.data.grounded, true);
  assert.match(result.data.answer, /42 samples/);
  assert.match(result.data.answer, /https:\/\/example\.test\/alpha/);
  assert.ok(captured.some((message) => message.content.includes(papers["synthetic-alpha"].body_md)));
  assert.ok(captured.every((message) => !message.content.includes("17 samples")));
  output = "The beta fixture reports 17 samples at https://example.test/beta. The alpha fixture reports 42 samples at https://example.test/alpha.";
  result = await ask("synthetic-beta");
  assert.equal(result.data.slug, "synthetic-beta");
  assert.match(result.data.answer, /17 samples/);
  assert.doesNotMatch(result.data.answer, /42 samples|example\.test\/alpha/);
  assert.ok(result.data.removed_statements >= 1);
  assert.ok(captured.every((message) => !message.content.includes("42 samples")));
  assert.equal(modelCalls, 2);
  assert.ok(sqlCalls.some((sql) => /FROM papers/.test(sql)));
  const before = modelCalls;
  result = await ask("synthetic-missing");
  assert.equal(result.status, 404);
  assert.equal(result.data.grounded, false);
  assert.equal(modelCalls, before);
  console.log("US10 synthetic selected-paper source identity and linked-answer acceptance passed");
} finally {
  globalThis.fetch = originalFetch;
}
