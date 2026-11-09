// Q08-FEDREG-LANE-1 (issue 8005): primary policy documents from the Federal Register JSON API as candidates. Offline: fetch is stubbed.
// Run: node q08-signal-engine/fedreg-lane.test.mjs
import assert from "node:assert/strict";
import { __domain as D } from "./worker.js";

let passes = 0;
const check = (label, cond, extra) => { assert.ok(cond, label + (extra === undefined ? "" : " -- " + JSON.stringify(extra).slice(0, 300))); passes++; };
const long = "This final rule revises the reporting thresholds for emissions from stationary sources and sets compliance dates for operators. ".repeat(3);
const docs = { results: [
  { document_number: "2026-20001", title: "Emission Reporting Thresholds for Stationary Sources", abstract: long, html_url: "https://www.federalregister.gov/documents/2026/11/05/2026-20001/x", body_html_url: "https://www.federalregister.gov/documents/full_text/html/2026/11/05/2026-20001.html", type: "Rule", agencies: [{ name: "Environmental Protection Agency" }] },
  { document_number: "2026-20002", title: "Notice of Meeting", abstract: "short", html_url: "https://www.federalregister.gov/d/2026-20002", type: "Notice" },
  { document_number: "2026-20003", title: "Immigration Enforcement Priorities Rule", abstract: long, html_url: "https://www.federalregister.gov/d/2026-20003", type: "Rule" }
] };
let calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify(docs), { status: 200 }); };

const on = D.parseDomains("tech,policy");
const rows = await D.scrapeFederalRegister({}, on);
check("one candidate: thin abstract and contested subject are left out", rows.length === 1 && rows[0].id === "2026-20001", rows);
check("candidate carries source, domain policy, the document url and the full-text url", rows[0].source === "federalregister" && rows[0].domain === "policy" && /federalregister\.gov\/documents\/2026/.test(rows[0].url) && /full_text/.test(rows[0].fulltext_url));
check("it reads the Federal Register documents.json API", /federalregister\.gov\/api\/v1\/documents\.json/.test(calls[0]));
check("storyDomain keeps it in policy while the policy token is on", D.storyDomain(rows[0], { core_concept: "x", friction_point: "y" }, on) === "policy");
check("sourceKindOf names the lane", /^federalregister-policy/.test(D.sourceKindOf(rows[0], 0)), D.sourceKindOf(rows[0], 0));
check("full text comes from body_html_url", D.articleUrlFor(rows[0]) === rows[0].fulltext_url);
calls = [];
const off = await D.scrapeFederalRegister({}, D.parseDomains("tech"));
check("with the policy token off the lane makes no request", off.length === 0 && calls.length === 0);
globalThis.fetch = async () => new Response("", { status: 503 });
let err = null;
try { await D.scrapeFederalRegister({}, on); } catch (e) { err = e; }
check("an API failure throws so the caller logs it and keeps the other candidates", err && /federalregister 503/.test(err.message));
console.log(passes + " passed");
