// BENCH-DATASET-1 offline suite (qnfo-ipatent 3.10.0, agent_issues 1779 step 1): the benchmark's patent sample is built from
// the keyless USPTO Patent Public Search API, stored once in R2, and the endpoint cannot be used to hammer the USPTO.
// Proves: only patents that cite a US provisional AND claim it directly (filed within 366 days) are kept; continuation
// chains, missing provisionals and missing claims are skipped and counted; GET never builds; POST builds once, later calls
// make no USPTO request; a running build answers 409; a failed build stores nothing; no model is called.
// Run: node qnfo-ipatent/bench-dataset.test.mjs   (prints "N passed, 0 failed")
const mod = await import("./worker.js");
const W = mod.default;
let passed = 0, failed = 0;
const ok = (c, l, x) => { if (c) passed++; else { failed++; console.error("FAIL " + l + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };

// Pacing sleeps are made instant here; the pacing itself is asserted through the 429 retry below.
const realSetTimeout = globalThis.setTimeout;
let sleeps = 0;
globalThis.setTimeout = (fn, ms) => { if (ms >= 1000) sleeps++; return realSetTimeout(fn, 0); };
const calls = [];
let failSearch = false, burst429 = 0;
const doc = (kind) => ({
  abstractHtml: "<p>An abstract.</p>",
  claimsHtml: kind === "noclaims" ? "<p>1. A thing.</p>" : "<p>1. A method comprising " + "steps of doing things, ".repeat(20) + "where x &amp;lt; y &amp; z &lt; w.</p>",
  descriptionHtml: kind === "noprov" ? "<p>No priority here.</p>" : "<p>This application claims the benefit of U.S. Provisional Application Ser. No. 63/123,456, filed Jan. 2, 2023.</p>",
  briefHtml: "", backgroundTextHtml: ""
});
// guid -> [filed, related, kind]
const PAT = {
  "US-1-B2": ["2024-01-01T00:00:00Z", "2023-01-02T00:00:00Z", "ok"],
  "US-2-B2": ["2024-01-01T00:00:00Z", "2015-01-02T00:00:00Z", "ok"],
  "US-3-B2": ["2024-01-01T00:00:00Z", "2023-06-01T00:00:00Z", "noprov"],
  "US-4-B2": ["2024-01-01T00:00:00Z", "2023-06-01T00:00:00Z", "noclaims"],
  "US-5-B2": ["2024-02-01T00:00:00Z", "2023-03-01T00:00:00Z", "ok"]
};
globalThis.fetch = async (u, o) => {
  const url = String(u && u.url || u);
  calls.push({ url, body: o && o.body });
  if (/users\/me\/session$/.test(url)) return new Response(JSON.stringify({ userCase: { caseId: 7 } }), { status: 200, headers: { "X-Access-Token": "tok" } });
  if (/searches\/searchWithBeFamily$/.test(url)) {
    if (failSearch) return new Response("busy", { status: 503 });
    const b = JSON.parse(o.body);
    const hits = b.start === 0 ? Object.keys(PAT).map((g) => ({ guid: g, type: "USPAT", inventionTitle: "T " + g, datePublished: "2025-03-01T00:00:00Z", applicationFilingDate: [PAT[g][0]], relatedApplFilingDate: [PAT[g][1]], cpcInventiveFlattened: "G06N3/08" })) : [];
    return new Response(JSON.stringify({ patents: hits, query: { id: 99 } }), { status: 200 });
  }
  const m = /highlightSections\/([^?]+)\?/.exec(url);
  if (m && burst429 > 0) { burst429--; return new Response("slow down", { status: 429 }); }
  if (m) return new Response(JSON.stringify(doc(PAT[decodeURIComponent(m[1])][2])), { status: 200 });
  return new Response("{}", { status: 404 });
};
const store = new Map();
const R2 = {
  async get(k) { if (!store.has(k)) return null; const v = store.get(k); return { text: async () => v, json: async () => JSON.parse(v) }; },
  async put(k, v) { store.set(k, typeof v === "string" ? v : String(v)); },
  async delete(k) { store.delete(k); }
};
let aiCalls = 0;
const stmt = () => { const s = { bind() { return s; }, async run() { return {}; }, async first() { return null; }, async all() { return { results: [] }; } }; return s; };
const env = { IPATENT_DB: { prepare: stmt }, IPATENT_R2: R2, AI: { run: async () => { aiCalls++; return {}; } } };
const ctx = { waitUntil() {} };
const req = (method) => W.fetch(new Request("https://ipatent.qnfo.org/api/benchmark/dataset", { method, headers: { "User-Agent": "t" } }), env, ctx);

let r = await req("GET"); let j = await r.json();
ok(r.status === 404 && j.status === "missing" && calls.length === 0, "GET with no stored sample answers 404 and never builds", j);

failSearch = true;
r = await req("POST"); j = await r.json();
ok(r.status === 502 && j.status === "failed" && !store.has("benchmark/dataset.json") && !store.has("benchmark/dataset.lock"), "a failed field stores no sample and releases the lock", j);
ok(!/503|busy/.test(JSON.stringify(j)), "the failure answer carries no upstream detail");
failSearch = false;

store.set("benchmark/dataset.lock", new Date().toISOString());
calls.length = 0;
r = await req("POST"); j = await r.json();
ok(r.status === 409 && j.status === "building" && calls.length === 0, "a build in progress answers 409 with no USPTO request");
store.delete("benchmark/dataset.lock");

calls.length = 0; burst429 = 2; sleeps = 0;
r = await req("POST"); j = await r.json();
ok(r.status === 202 && j.status === "partial" && j.fields_done.length === 1 && j.fields_done[0].key === "ml", "the first POST builds one field and answers 202 partial", j);
ok(calls.every((c) => !/A61B|H01M/.test(c.body || "")), "one field per call: no other field is searched");
ok(burst429 === 0 && j.fields_done[0].kept === 2, "a 429 burst is retried, not fatal");
ok(sleeps >= 5, "document reads are paced (" + sleeps + " paced waits)");
r = await req("POST"); j = await r.json();
ok(r.status === 202 && j.fields_done.length === 2, "the second POST builds the next field");
r = await req("POST"); j = await r.json();
ok(r.status === 201 && j.status === "built" && !store.has("benchmark/dataset.partial.json"), "the third POST assembles and stores the sample, and drops the progress file", j);
const ds = JSON.parse(store.get("benchmark/dataset.json"));
const f0 = ds.fields[0];
ok(ds.fields.length === 3 && ds.fields.map((f) => f.query.split("$")[0]).join() === "G06N,A61B,H01M", "three fields by CPC subclass", ds.fields.map((f) => f.query));
ok(f0.patents.map((p) => p.guid).join() === "US-1-B2,US-5-B2", "only direct provisional claims are kept", f0.patents.map((p) => p.guid));
ok(f0.skipped["not a direct claim to the provisional"] === 1 && f0.skipped["no provisional reference"] === 1 && f0.skipped["claims text missing"] === 1, "every skip is counted by reason", f0.skipped);
ok(/where x &lt; y & z < w\.$/.test(f0.patents[0].claims), "entities decode once: &amp;lt; stays the text &lt; (CodeQL js/double-escaping)", f0.patents[0].claims.slice(-40));
ok(f0.patents[0].provisional_no === "63/123,456" && f0.patents[0].filing_gap_days === 364 && f0.patents[0].claims.length > 200, "kept rows carry the provisional number, the filing gap and verbatim claims", f0.patents[0]);
ok(/@pd>="20250101"<="20250630"/.test(f0.query) && ds.window.from === "20250101", "the query and window are stored with the sample");
ok(ds.patents_total === 6 && ds.complete === false, "a short field is reported, never padded (6 of 30)");
ok(!JSON.stringify(j).includes("steps of doing things"), "the HTTP answer is a summary; claims text stays in R2");
ok(calls.every((c) => /^https:\/\/ppubs\.uspto\.gov\/api\//.test(c.url)), "every request goes to the USPTO API");
ok(aiCalls === 0, "no model is called");
ok(!calls.some((c) => /highlightSections\/US-2-B2/.test(c.url)), "a continuation chain is skipped on its search dates, before any document read");

calls.length = 0;
r = await req("POST"); j = await r.json();
ok(r.status === 200 && j.status === "stored" && calls.length === 0, "a second POST returns the stored sample with no USPTO request");
r = await req("GET"); j = await r.json();
ok(r.status === 200 && j.patents_total === 6 && j.r2_key === "benchmark/dataset.json", "GET answers the stored summary");
r = await W.fetch(new Request("https://ipatent.qnfo.org/api/benchmark/dataset", { method: "DELETE" }), env, ctx);
ok(r.status !== 200 || !(await r.text()).includes("stored"), "other methods do not reach the dataset");

console.log(passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
